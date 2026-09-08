<!-- pkg-family/pages/gedcom-import/gedcom-import.vue — GEDCOM 导入导出（R30） -->
<template>
  <view class="container">
    <view class="header">
      <text class="title">GEDCOM 数据交换</text>
      <text class="subtitle">标准家谱格式导入/导出（5.5.1 / 7.0）</text>
    </view>

    <!-- 权限门禁 -->
    <view v-if="!canAccess" class="no-access-wrap">
      <view class="no-access-card">
        <text class="no-access-icon">🔒</text>
        <text class="no-access-title">无权限访问</text>
        <text class="no-access-msg">GEDCOM 导入导出需要族史委及以上角色权限。</text>
        <button class="no-access-back" @tap="goBack">↩ 返回</button>
      </view>
    </view>

    <template v-else>
      <!-- 消息组件 -->
      <MsgToast ref="msgToastRef" />
      <ErrorToast v-if="errorMessage" :message="errorMessage" @hide="errorMessage = ''" />

      <!-- 导出区域 -->
      <BaseCard title="📥 导出数据">
        <button size="medium" @tap="onExportGedCom" :loading="exporting">导出当前分支 GEDCOM 文件</button>
        <text class="hint">生成 .ged/.gedc 文件，包含成员、家庭单元完整信息</text>
      </BaseCard>

      <!-- 导入区域 -->
      <BaseCard title="📤 导入数据">
        <button size="medium" @tap="onUploadFile">上传 GEDCOM 文件</button>
        <button size="medium" @tap="onPasteContent">粘贴 GEDCOM 内容</button>
        <text class="hint">支持 Gedcom 5.5.1 / 7.0 标准格式；需双人审核确认</text>
      </BaseCard>

      <!-- 预览弹窗 -->
      <view v-if="showPreview" class="modal-overlay" @tap="closePreview">
        <view class="modal-content" @tap.stop>
          <view class="modal-header">
            <text class="modal-title">数据预览</text>
            <button class="close-btn" @tap="closePreview">×</button>
          </view>
          <view class="modal-body">
            <text class="preview-count">{{ previewResult?.previewCount || 0 }} 条记录待入库</text>
            <scroll-view scroll-y class="preview-scroll" style="height: 400px;">
              <view class="preview-item" v-for="(m, i) in previewResult?.members || []" :key="i">
                <text class="item-name">{{ m.name }}</text>
                <text class="item-detail">性别：{{ m.gender }} | 生卒：{{ m.birthDate || '-' }} ~ {{ m.deathDate || '在世' }}</text>
              </view>
            </scroll-view>
          </view>
          <view class="modal-footer">
            <button class="btn-reject" @tap="rejectImport">放弃</button>
            <button class="btn-confirm" @tap="confirmReview">提交审核</button>
          </view>
        </view>
      </view>

      <!-- 审核提示 -->
      <BaseCard v-if="showReviewInfo" title="⚠️ 双人审核流程">
        <text class="hint">• 族史委 A 初审 → 族史委 B 复核 → 公示期 → 正式入库<br/>• 请准备好至少两名审核人 OpenID</text>
      </BaseCard>
    </template>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import BaseCard from '@/components/common/BaseCard.vue';
import ErrorToast from '@/components/common/ErrorToast.vue';
import MsgToast from '@/components/common/MsgToast.vue';
import { exportGedCom, previewGedCom, commitImport } from '@/services/gedcom';
import { getMyRole, hasRole } from '@/utils/auth';
import msg from '@/utils/msg';

const userRole = ref('VISITOR');
const canAccess = computed(() => ['HISTORIAN', 'CHIEF'].includes(userRole.value));
const exporting = ref(false);
const errorMessage = ref('');
const showPreview = ref(false);
const showReviewInfo = ref(true);
const previewResult = ref(null);
const msgToastRef = ref(null);

async function loadUserRole() {
  try {
    const role = await getMyRole();
    userRole.value = role;
  } catch (err) {
    console.warn('loadUserRole failed:', err.message);
    userRole.value = 'VISITOR';
  }
}

function goBack() {
  uni.navigateBack();
}

// ─── 导出功能 ───
async function onExportGedCom() {
  if (!canAccess.value) return;
  
  msg.showLoading('准备导出...');
  try {
    exporting.value = true;
    const res = await exportGedCom();
    
    if (res.error) {
      throw new Error(res.error.message || '导出失败');
    }
    
    // 下载文件
    const content = res.data.content;
    const fileName = res.data.fileName || 'family_tree.ged';
    
    // #ifdef MP-WEIXIN
    const fs = uni.getFileSystemManager();
    const path = `${uni.env.USER_DATA_PATH}/${fileName}`;
    fs.writeFileSync(path, content, 'utf8');
    
    wx.saveFile({
      tempFilePath: path,
      success: () => msg.success(`已保存 ${fileName}`),
      fail: (err) => msg.error('保存失败')
    });
    // #endif
    
    msg.success('GEDCOM 导出成功');
  } catch (e) {
    msg.error(e.message || '导出失败');
  } finally {
    exporting.value = false;
  }
}

// ─── 导入功能 ───
async function onUploadFile() {
  // #ifdef MP-WEIXIN
  wx.chooseMessageFile({
    type: 'file',
    extension: ['ged', 'gedc'],
    success: async (res) => {
      if (!res.tempFiles?.length) return;
      const file = res.tempFiles[0];
      
      msg.showLoading('读取文件中...');
      try {
        const content = await readFileText(file.filePath);
        await doPreview(content);
      } catch (e) {
        msg.error('文件读取失败');
      }
    },
    fail: (err) => {
      if (err?.errMsg?.includes('cancel')) return;
      msg.error('选择文件失败');
    }
  });
  // #endif
  
  // #ifndef MP-WEIXIN
  msg.warn('仅微信小程序支持文件上传');
  // #endif
}

async function onPasteContent() {
  uni.showModal({
    title: '粘贴 GEDCOM 内容',
    placeholderText: '粘贴 .ged 文件内容...',
    success: (res) => {
      if (res.confirm && res.content) {
        doPreview(res.content);
      }
    }
  });
}

function readFileText(filePath) {
  return new Promise((resolve, reject) => {
    uni.getFileSystemManager().readFile({
      filePath,
      encoding: 'utf8',
      success: (res) => resolve(res.data),
      fail: reject
    });
  });
}

async function doPreview(content) {
  msg.showLoading('解析中...');
  try {
    const res = await previewGedCom(content);
    
    if (res.error) {
      throw new Error(res.error.message || '解析失败');
    }
    
    previewResult.value = res.data;
    showPreview.value = true;
    msg.success('解析成功，请预览后提交审核');
  } catch (e) {
    msg.error(e.message || '解析失败');
  }
}

function closePreview() {
  showPreview.value = false;
  previewResult.value = null;
}

function rejectImport() {
  closePreview();
  msg.warn('已取消导入');
}

async function confirmReview() {
  if (!previewResult.value?.members?.length) {
    msg.error('无数据可提交');
    return;
  }
  
  // 模拟获取审核人（实际需从用户输入）
  const reviewerOpenids = await askForReviewers();
  
  if (!reviewerOpenids || reviewerOpenids.length < 2) {
    msg.error('需要至少两名族史委审核');
    return;
  }
  
  if (!await msg.confirm('确认提交审核？导入操作将写入审计日志。')) {
    return;
  }
  
  try {
    const res = await commitImport({
      memberDataArray: previewResult.value.members,
      reviewerOpenids
    });
    
    if (res.error) {
      throw new Error(res.error.message || '提交失败');
    }
    
    msg.success(`${res.data.imported}条记录已提交审核`);
    closePreview();
  } catch (e) {
    msg.error(e.message || '提交失败');
  }
}

function askForReviewers() {
  return new Promise((resolve) => {
    uni.showModal({
      title: '输入审核人 OpenID',
      inputPlaceholder: '用逗号分隔，如：o-xxx1,o-xxx2',
      success: (res) => {
        if (res.confirm) {
          const ids = res.content.split(',').map(s => s.trim()).filter(Boolean);
          resolve(ids);
        } else {
          resolve(null);
        }
      }
    });
  });
}
</script>

<style scoped lang="scss">
.container { padding: 24rpx; }
.header { margin-bottom: 32rpx; text-align: center; }
.title { font-size: 36px; font-weight: bold; color: #333; display: block; }
.subtitle { font-size: 24px; color: #999; margin-top: 8rpx; display: block; }

.no-access-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.no-access-card {
  background: #fff;
  border-radius: 12px;
  padding: 48rpx;
  text-align: center;
}
.no-access-icon { font-size: 64px; display: block; }
.no-access-title { font-size: 28px; font-weight: bold; color: #ee0a24; display: block; margin: 16rpx 0; }
.no-access-msg { font-size: 24px; color: #666; display: block; margin-bottom: 24rpx; line-height: 1.5; }
.no-access-back {
  background: #07c160;
  color: #fff;
  font-size: 28px;
  padding: 16rpx 48rpx;
  border-radius: 8px;
  border: none;
}

.hint { font-size: 22px; color: #999; display: block; margin-top: 12rpx; line-height: 1.6; }

.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.modal-content {
  background: #fff;
  width: 80%;
  max-width: 600rpx;
  border-radius: 16px;
  overflow: hidden;
  animation: slide-up 0.3s ease;
}
@keyframes slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx;
  border-bottom: 1rpx solid #eee;
}
.modal-title { font-size: 28px; font-weight: bold; }
.close-btn {
  font-size: 40px;
  color: #999;
  line-height: 1;
  background: none;
  border: none;
  padding: 0;
  height: auto;
}
.modal-body { padding: 24rpx; }
.preview-count { font-size: 24px; color: #666; display: block; margin-bottom: 16rpx; }
.preview-scroll { min-height: 300rpx; }
.preview-item {
  border-bottom: 1rpx solid #f5f5f5;
  padding: 16rpx 0;
}
.item-name { font-size: 28px; font-weight: bold; color: #333; display: block; }
.item-detail { font-size: 22px; color: #999; margin-top: 4rpx; display: block; }
.modal-footer {
  display: flex;
  gap: 16rpx;
  padding: 24rpx;
  border-top: 1rpx solid #eee;
}
.btn-reject, .btn-confirm {
  flex: 1;
  padding: 20rpx 0;
  border-radius: 8px;
  font-size: 28px;
}
.btn-reject {
  background: #f2f2f2;
  color: #333;
}
.btn-confirm {
  background: #07c160;
  color: #fff;
}
</style>
