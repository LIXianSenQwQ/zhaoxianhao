<!-- pkg-family/pages/branches-import/branches-import.vue — 批量导入分支（EDITOR+） -->
<template>
  <view class="container">
    <!-- 权限门禁 -->
    <view v-if="!canAccess" class="no-access-wrap">
      <view class="no-access-card">
        <text class="no-access-icon">🔒</text>
        <text class="no-access-title">无权限访问</text>
        <text class="no-access-msg">批量导入分谱/支谱需要编辑（EDITOR）及以上角色权限。如需开通，请联系族长或族史委。</text>
        <button class="no-access-back" @tap="goBack">↩ 返回</button>
      </view>
    </view>

    <!-- 正常内容 -->
    <template v-else>
      <view class="header">
        <text class="title">批量导入分谱/支谱</text>
        <text class="subtitle">一次最多导入 100 行；code 字段无需填写，系统自动生成 HAO- 编码</text>
      </view>

      <!-- 全局消息展示组件 -->
      <MsgToast ref="msgToastRef" />

      <!-- 错误提示 -->
      <ErrorToast v-if="errorMessage" :message="errorMessage" @hide="errorMessage = ''" />

      <!-- 模板下载 -->
      <BaseCard title="📄 下载模板">
        <button size="small" @tap="onDownloadTemplate">生成 CSV 模板并分享</button>
        <text class="hint">表头：name,level,parentCode,region,description,generationVerses</text>
      </BaseCard>

      <!-- OCR 照片扫描（R29） -->
      <BaseCard v-if="hasRole(userRole.value, 'EDITOR')" title="📸 照片 OCR 识别（Beta）">
        <button size="small" @tap="onPhotoScan">从相册选择族谱照片</button>
        <text class="hint">自动识别分支字段；先发送照片到聊天窗口再上传（微信小程序安全策略）</text>
      </BaseCard>

      <!-- 上传区域 -->
      <BaseCard v-if="!rows.length" title="导入分支">
        <button size="default" @tap="onChooseFile">📥 从聊天记录选择文件 (CSV / Excel)</button>
        <text class="hint">支持 .csv、.xlsx、.xls；请先把文件发送到任意微信聊天，再从这里选取。首次上传可预览前 10 行。</text>
      </BaseCard>

      <!-- 进度条（分批导入时使用） -->
      <view v-if="progress?.total" class="progress-container">
        <view class="progress-bar">
          <view class="progress-fill" :style="{ width: `${(progress.completed / progress.total) * 100}%` }"></view>
        </view>
        <text class="progress-text">{{ progress.completed }}/{{ progress.total }} 行已导入</text>
      </view>

      <!-- 预览表 -->
      <view v-if="previewRows.length">
        <view class="preview-title">数据预览（{{ previewRows.length }} 行）</view>
        <view class="preview-table">
          <view class="table-header">
            <view class="th">#</view>
            <view class="th">name</view>
            <view class="th">level</view>
            <view class="th">parentCode</view>
            <view class="th">region</view>
            <view class="th">description</view>
          </view>
          <view class="table-body">
            <view class="tr" v-for="(row, idx) in previewRows" :key="idx">
              <view class="td">{{ idx + 1 }}</view>
              <view class="td">{{ row.name }}</view>
              <view class="td">{{ row.level }}</view>
              <view class="td">{{ row.parentCode || '—' }}</view>
              <view class="td">{{ row.region || '—' }}</view>
              <view class="td">{{ (row.description || '').slice(0, 15) }}</view>
            </view>
          </view>
        </view>
        <view class="actions">
          <button class="btn btn-primary" :loading="submitting" :disabled="submitting" @tap="onSubmitImport">🚀 开始提交</button>
          <button class="btn btn-default" :disabled="submitting" @tap="resetPreview">↩ 重新上传</button>
        </view>
      </view>

      <!-- 结果反馈 -->
      <view v-if="result && (result.success?.length || result.failed?.length)">
        <BaseCard title="导入结果 ✅">
          <text>成功：{{ result.success?.length || 0 }} | 失败：{{ result.failed?.length || 0 }}</text>
          <view class="result-list" v-if="result.success?.length">
            <text class="success-item" v-for="item in result.success.slice(0, 10)" :key="item.code">
              {{ item.row }} → {{ item.code }}
            </text>
          </view>
          <view class="error-list" v-if="result.failed?.length">
            <text class="error-item" v-for="item in result.failed" :key="item.row">
              ❌ {{ item.row }} {{ item.name }} — {{ item.reason }}
            </text>
          </view>
          <button @tap="resetPreview">✅ 关闭</button>
        </BaseCard>
      </view>

      <!-- OCR 占位说明（R29 启用） -->
      <view class="ocr-hint">
        <BaseCard title="OCR 服务接入说明">
          <text class="hint">🔜 当前为占位模式；R29 将接入腾讯云 OCR / 百度 AI 进行真实字段识别。</text>
        </BaseCard>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import BaseCard from '@/components/common/BaseCard.vue';
import ErrorToast from '@/components/common/ErrorToast.vue';
import MsgToast from '@/components/common/MsgToast.vue';
import { importBranches } from '@/services/branch';
import { getMyRole, hasRole } from '@/utils/auth';
import * as photoOcr from '@/services/photoOcr';
import msg from '@/utils/msg';

const rows = ref([]);
const previewRows = ref([]);
const submitting = ref(false);
const errorMessage = ref('');
const result = ref(null);
const userRole = ref('VISITOR');
const progress = ref({ total: 0, completed: 0 }); // 进度条状态
const msgToastRef = ref(null);

// 权限判断：EDITOR+ 才可导入
const canAccess = computed(() => ['EDITOR', 'HISTORIAN', 'CHIEF'].includes(userRole.value));

/** 获取当前用户角色 */
async function loadUserRole() {
  try {
    const role = await getMyRole();
    userRole.value = role;
  } catch (err) {
    console.warn('loadUserRole failed:', err.message);
    // 默认降级为访客（避免白屏）
    userRole.value = 'VISITOR';
  }
}

onMounted(async () => {
  await loadUserRole();
});

function goBack() {
  uni.navigateBack();
}

/** 模板表头 */
const TEMPLATE_HEADER = 'name,level,parentCode,region,description,generationVerses';

/** 下载模板：生成 CSV 写入本地后通过微信分享（wx.shareFileMessage），失败则复制表头 */
async function onDownloadTemplate() {
  msg.showLoading('准备模板...');
  try {
    const content = `${TEMPLATE_HEADER}\n示例分支，2,,河北省石家庄市赵县，示例描述，字辈诗\n示例支谱，3,HAO-0000-01，赵县南庄，示例支谱描述，天地玄黄\n`;
    const fs = uni.getFileSystemManager();
    const path = `${uni.env.USER_DATA_PATH}/branches-template.csv`;
    fs.writeFileSync(path, content, 'utf8');
    
    // #ifdef MP-WEIXIN
    wx.shareFileMessage({
      filePath: path,
      fileName: 'branches-template.csv',
      success: () => {
        msg.hideLoading();
        msg.success('模板已分享');
      },
      fail: (err) => {
        msg.hideLoading();
        fallbackCopyTemplate();
      }
    });
    // #endif
    // #ifndef MP-WEIXIN
    msg.hideLoading();
    fallbackCopyTemplate();
    // #endif
  } catch (e) {
    msg.hideLoading();
    console.error('template write error:', e);
    msg.error('模板准备失败');
    fallbackCopyTemplate();
  }
}

/** 降级方案：复制模板表头到剪贴板 */
function fallbackCopyTemplate() {
  uni.setClipboardData({
    data: TEMPLATE_HEADER,
    success: () => msg.success('已复制表头，请粘贴到 Excel')
  });
}

/** 从微信聊天记录选择文件（uni.chooseMessageFile 仅微信小程序支持） */
function onChooseFile() {
  // #ifdef MP-WEIXIN
  wx.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['csv', 'xlsx', 'xls'],
    success: (res) => {
      if (!res.tempFiles?.length) return;
      handleFile(res.tempFiles[0]);
    },
    fail: (err) => {
      if (err?.errMsg?.includes('cancel')) return;
      msg.error('选择文件失败，请重试');
    }
  });
  // #endif
  // #ifndef MP-WEIXIN
  msg.warn('当前平台暂不支持文件导入');
  // #endif
}

/** 照片 OCR 扫描（R29） */
async function onPhotoScan() {
  try {
    msg.showLoading('选择照片...');
    // #ifdef MP-WEIXIN
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0];
        
        // ① 上传图片获取 fileId
        const fileID = await photoOcr.uploadImage(tempFilePath, 'docscan');
        msg.showLoading('正在识别...');
        
        // ② 调用 OCR 云函数
        const url = await wx.cloud.getTempFileURL({ fileList: [fileID] }).then(r => r.fileList[0]?.tempFileURL);
        const ocrRes = await photoOcr.detectBranchFromPhoto(fileID);
        
        if (ocrRes.data?.result?.fields) {
          const fields = ocrRes.data.result.fields;
          const newRow = {
            name: fields.name || '',
            level: fields.level || 2,
            parentCode: fields.parentCode || '',
            region: fields.region || '',
            description: fields.description || '',
            generationVerses: fields.generationVerses || '',
            _rawIndex: 1
          };
          
          rows.value = [newRow];
          previewRows.value = [newRow];
          result.value = null;
          msg.success('识别成功！已填入表单，请核对后提交');
        } else {
          msg.error('未识别到有效信息，请手动填写');
        }
      },
      fail: () => msg.warn('取消选择')
    });
    // #endif
    // #ifndef MP-WEIXIN
    msg.warn('当前平台暂不支持照片上传');
    // #endif
  } catch (e) {
    msg.hideLoading();
    console.error('photo scan error:', e);
    msg.error('操作失败，请稍后重试');
  }
}

/** 处理选中的文件：按扩展名分发到 CSV / Excel 解析 */
async function handleFile(file) {
  errorMessage.value = '';
  progress.value = { total: 0, completed: 0 };
  try {
    const name = (file.name || file.path || '').toLowerCase();
    if (name.endsWith('.csv') || file.type === 'csv') {
      const text = await readFileText(file.path);
      rows.value = parseCSV(text);
    } else {
      // 📦 Excel 解析：接入 SheetJS(xlsx) 真实解析（需先运行：npm install xlsx --legacy-peer-deps）
      // TODO(v2.0): 安装 xlsx 库后再取消注释以下代码：
      // import XLSX from 'xlsx';
      // const arrayBuffer = await readFileBinary(file.path);
      // const wb = XLSX.read(arrayBuffer, { type: 'array' });
      // const firstSheet = wb.SheetNames[0];
      // const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet]);
      // rows.value = normalizeExcelRows(jsonData);
      
      // 占位实现：显示提示信息
      uni.showToast({ 
        title: 'Excel 解析需要安装 xlsx 库，请先运行：npm install xlsx --legacy-peer-deps', 
        icon: 'none',
        duration: 5000
      });
      rows.value = [];
    }

    if (!rows.value.length) {
      errorMessage.value = '文件为空或格式不正确（首行需为表头）';
      return;
    }
    previewRows.value = rows.value.slice(0, 10);
    result.value = null;
    msg.success(`已读取 ${rows.value.length} 行`);
  } catch (err) {
    console.error('file read error:', err);
    errorMessage.value = '读取失败，请确认文件格式后重试';
  }
}

/** 规范化 Excel 行字段（与 CSV 相同规范） */
function normalizeExcelRows(rows) {
  return rows.map((row, idx) => ({
    name: row.name || '',
    level: parseInt(row.level, 10) || 0,
    parentCode: row.parentCode || '',
    region: row.region || '',
    description: row.description || '',
    generationVerses: row.generationVerses || '',
    _rawIndex: idx + 2
  })).filter(r => r.name).map(normalizeRow);
}

/** 解析 CSV（支持引号内逗号） */
function parseCSV(fileContent) {
  const lines = String(fileContent || '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  return lines
    .slice(1)
    .map((line, idx) => {
      if (!line.trim()) return null;
      const values = splitCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => (obj[h] = (values[i] || '').trim()));
      obj._rawIndex = idx + 2; // 文件行号（含表头）
      return obj;
    })
    .filter(Boolean)
    .map(normalizeRow);
}

/** 按引号感知方式拆分一行 CSV */
function splitCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 规范化行字段：必填校验 + level 约束 */
function normalizeRow(row) {
  const level = parseInt(row.level, 10);
  return {
    name: row.name || '',
    level: level === 2 || level === 3 ? level : 0, // 0 表示非法，提交前拦截
    parentCode: row.parentCode || '',
    region: row.region || '',
    description: row.description || '',
    generationVerses: row.generationVerses || '',
    _rawIndex: row._rawIndex
  };
}

/** 读取文本文件内容（Promise 封装） */
function readFileText(path) {
  return new Promise((resolve, reject) => {
    uni.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'utf8',
      success: (res) => resolve(res.data),
      fail: reject
    });
  });
}

/** 读取二进制文件内容（Promise 封装） */
function readFileBinary(path) {
  return new Promise((resolve, reject) => {
    uni.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'base64',
      success: (res) => {
        // 转换为 ArrayBuffer 供 xlsx 库使用
        const buffer = base64ToArrayBuffer(res.data);
        resolve(buffer);
      },
      fail: reject
    });
  });
}

/** Base64 转 ArrayBuffer */
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/** 重置预览与结果 */
function resetPreview() {
  rows.value = [];
  previewRows.value = [];
  result.value = null;
  errorMessage.value = '';
  progress.value = { total: 0, completed: 0 };
}

/** 提交导入：本地预校验后调用云函数 */
async function onSubmitImport() {
  if (!rows.value.length) {
    errorMessage.value = '请先选择文件';
    return;
  }
  if (rows.value.length > 100) {
    errorMessage.value = '单次最多导入 100 行';
    return;
  }
  // 本地预校验：name 必填、level 必须为 2/3
  const invalid = rows.value.filter((r) => !r.name || ![2, 3].includes(r.level));
  if (invalid.length) {
    errorMessage.value = `第 ${invalid.slice(0, 5).map((r) => r._rawIndex).join('、')} 行数据不合法（name 必填，level 仅支持 2 或 3）`;
    return;
  }

  // 💾 分批导入策略：每块 20 条，共 5 批（最大 100 行）
  const BATCH_SIZE = 20;
  const batches = Array.from({ length: Math.ceil(rows.value.length / BATCH_SIZE) }, (_, i) => 
    rows.value.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
  );

  submitting.value = true;
  errorMessage.value = '';
  result.value = null;
  progress.value = { total: batches.length, completed: 0 };

  try {
    const allSuccess = [];
    const allFailed = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const res = await importBranches(batch);

      if (!res.error && res.data) {
        allSuccess.push(...res.data.success || []);
        allFailed.push(...res.data.failed || []);
      } else {
        // 某一批整体失败
        batch.forEach((_, idx) => {
          const rowIndex = i * BATCH_SIZE + idx + 1;
          allFailed.push({
            row: rowIndex,
            name: batch[idx]?.name || `row${rowIndex}`,
            reason: res.error?.message || '未知错误'
          });
        });
      }

      progress.value = { total: batches.length, completed: i + 1 };
    }

    if (allSuccess.length || allFailed.length) {
      result.value = { success: allSuccess, failed: allFailed };
      msg.success('导入完成');
    } else {
      errorMessage.value = '未导入任何数据';
    }
  } catch (e) {
    console.error('import error:', e);
    errorMessage.value = e?.message || '网络异常，请稍后重试';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.container { padding: 20px; background: #f7f8fa; min-height: 100vh; }

/* 权限门禁提示卡片 */
.no-access-wrap { padding: 60px 20px; }
.no-access-card {
  background: #fff;
  border-radius: 12px;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.no-access-icon { font-size: 48px; margin-bottom: 16px; }
.no-access-title { font-size: 18px; font-weight: 600; color: #333; margin-bottom: 12px; }
.no-access-msg { font-size: 13px; color: #888; line-height: 1.6; margin-bottom: 24px; }
.no-access-back {
  background: #07c160;
  color: #fff;
  font-size: 14px;
  padding: 8px 28px;
  border-radius: 6px;
}
.header { margin-bottom: 16px; }
.title { font-size: 20px; font-weight: bold; color: #333; display: block; }
.subtitle { font-size: 12px; color: #888; margin-top: 4px; display: block; }
.preview-title { font-size: 15px; font-weight: bold; color: #333; margin: 16px 0 8px; }
.preview-table { overflow-x: auto; }
.table-header { display: flex; background: #eee; font-weight: bold; padding: 8px; }
.table-body { max-height: 200px; overflow-y: auto; }
.tr { display: flex; border-bottom: 1px solid #ddd; padding: 6px; }
.th, .td { flex: 1; padding-left: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.actions { margin-top: 16px; display: flex; gap: 8px; }
.btn { flex: 1; }
.btn-primary { background: #07c160; color: #fff; }
.btn-default { background: #f2f2f2; color: #333; }
.result-list, .error-list { margin-top: 12px; }
.success-item { display: block; color: #07c160; margin: 4px 0; font-size: 13px; }
.error-item { display: block; color: #ee0a24; margin: 4px 0; font-size: 13px; }
.ocr-hint { margin-top: 24px; opacity: 0.6; }
.hint { font-size: 12px; color: #999; display: block; margin-top: 8px; line-height: 1.5; }

/* 进度条样式 */
.progress-container { margin: 16px 0; }
.progress-bar { height: 8px; background: #eee; border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; background: #07c160; transition: width 0.3s ease; }
.progress-text { font-size: 12px; color: #888; margin-top: 4px; }
</style>
