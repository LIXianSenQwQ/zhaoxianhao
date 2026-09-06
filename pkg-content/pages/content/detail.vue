<template>
  <view class="detail-page">
    <!-- 顶部导航 -->
    <view class="page-header">
      <text class="page-title">{{ content.title || '内容详情' }}</text>
      <text class="page-subtitle">{{ typeLabel }}</text>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text class="spinner">⏳</text>
      <text class="hint">加载中...</text>
    </view>

    <!-- 错误状态 -->
    <view v-else-if="error" class="error-state">
      <text class="error-icon">❌</text>
      <text class="error-text">{{ error }}</text>
      <button class="retry-btn" @click="reloadContent">重试</button>
    </view>

    <!-- 内容展示区 -->
    <view v-else class="content-viewer">
      <!-- 媒体预览 -->
      <view v-if="currentItem.mediaIds?.length > 0 && currentType !== 'record'" class="media-area">
        <swiper 
          v-if="currentItem.mediaIds.length > 1"
          class="media-swiper"
          :indicator-dots="true"
          :autoplay="false"
        >
          <swiper-item v-for="(mid, i) in currentItem.mediaIds" :key="i">
            <image :src="getMediaUrl(mid)" mode="aspectFit" class="swipe-img" lazy-load />
          </swiper-item>
        </swiper>
        <image v-else :src="getMediaUrl(currentItem.mediaIds[0])" mode="aspectFit" class="single-media" lazy-load />
      </view>

      <!-- 文本内容 -->
      <view class="text-area">
        <text class="content-title">{{ currentItem.title }}</text>
        <text class="content-meta">{{ metaInfo }}</text>
        <view class="content-body" v-html="renderedContent"></view>
      </view>

      <!-- 分类标签 -->
      <view v-if="hasCategory" class="category-section">
        <text class="cat-chip">#{{ currentItem.mainCategory }}</text>
        <text v-if="currentItem.subCategory" class="cat-chip">#{{ currentItem.subCategory }}</text>
        <text v-for="tag in currentItem.tags?.slice(0,5)" :key="tag" class="tag-chip">{{ tag }}</text>
      </view>

      <!-- 可见性标识 -->
      <view class="visibility-badge">
        <text>{{ visibilityLabel }}</text>
      </view>
    </view>

    <!-- 工具条 -->
    <view v-if="!loading && !error" class="toolbar">
      <view class="tool-left">
        <view class="tool-btn" @click="toggleEditMode">
          <text>{{ isEditMode ? '取消' : '编辑' }}</text>
        </view>
        <view class="tool-btn secondary" @click="shareContent">
          <text>分享</text>
        </view>
      </view>
      <view class="tool-right">
        <view class="action-btn danger" @click="confirmDelete">
          <text>删除</text>
        </view>
      </view>
    </view>

    <!-- 编辑模式 -->
    <view v-if="isEditMode && !loading" class="edit-mode">
      <input 
        v-model="editForm.title"
        placeholder="编辑标题"
        class="input-field"
        maxlength="50"
      />
      
      <textarea 
        v-if="currentType === 'record'"
        v-model="editForm.content"
        placeholder="编辑内容"
        class="input-field textarea"
        maxlength="20000"
      />

      <view class="visibility-row">
        <text class="cat-label">修改可见性</text>
        <radio-group @change="onVisibilityChange">
          <label class="radio-item" v-for="v in visibilityOpts" :key="v.value">
            <radio :value="v.value" :checked="editForm.visibility === v.value" color="#B03A2E" />
            <text>{{ v.label }}</text>
          </label>
        </radio-group>
      </view>

      <view class="save-actions">
        <button class="cancel-btn" @click="cancelEdit">取消</button>
        <button class="save-btn" :class="{ disabled: !editFormReady }" @click="saveEdit">保存</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import * as contentSvc from '@/services/content';
import { onLoad } from '@dcloudio/uni-app';

type ContentType = 'article' | 'story' | 'photo' | 'video' | 'record';
type Visibility = 'PRIVATE' | 'GROUP' | 'PUBLIC';

const id = ref('');
const loading = ref(true);
const error = ref<string>('');
const content = ref<any>(null);
const currentItem = ref<any>({});

const isEditMode = ref(false);
const editForm = ref<{ title: string; content: string; visibility: Visibility }>({
  title: '', content: '', visibility: 'PRIVATE'
});

// 类型标签
const typeMap: Record<string, string> = {
  article: '文章', story: '故事', photo: '照片', video: '视频', record: '记录'
};
const typeLabel = computed(() => currentItem.value.type ? typeMap[currentItem.value.type] : '');

// 元信息
const metaInfo = computed(() => {
  const time = currentItem.value.createdAt ? new Date(currentItem.value.createdAt).toLocaleString('zh-CN') : '';
  return [time, currentItem.value.isOwner ? '（本人）' : ''].filter(Boolean).join('');
});

// 渲染内容（简单换行，生产环境可用白名单富文本解析）
const renderedContent = computed(() => {
  if (!currentItem.value.content) return '<text class="empty-content">暂无内容</text>';
  return currentItem.value.content.replace(/\n/g, '<br/>');
});

const hasCategory = computed(() => currentItem.value.mainCategory || currentItem.value.subCategory || (currentItem.value.tags || []).length > 0);

const visibilityMap: Record<string, string> = {
  PRIVATE: '仅自己可见', GROUP: '指定可见', PUBLIC: '公开'
};
const visibilityLabel = computed(() => visibilityMap[currentItem.value.visibility] || '未知');

// 加载内容
async function loadContent() {
  loading.value = true;
  error.value = '';
  try {
    const res = await contentSvc.getContentDetail(id.value);
    if (res.success && res.data.content) {
      currentItem.value = res.data.content;
      editForm.value = {
        title: currentItem.value.title || '',
        content: currentItem.value.content || '',
        visibility: currentItem.value.visibility || 'PRIVATE'
      };
      content.value = res.data;
    } else {
      error.value = res.data?.message || '加载失败';
    }
  } catch (e) {
    error.value = e.message || '网络异常';
  } finally {
    loading.value = false;
  }
}

function getMediaUrl(mediaId: string): string {
  // TODO: 实际使用临时文件 URL；stub 返回占位符
  console.log('[Detail] mediaId:', mediaId);
  return mediaId.includes('http') ? mediaId : `https://placeholder.com/${mediaId}.jpg`;
}

// 切换编辑模式
function toggleEditMode() {
  isEditMode.value = !isEditMode.value;
  if (isEditMode.value) {
    editForm.value = {
      title: currentItem.value.title || '',
      content: currentItem.value.content || '',
      visibility: currentItem.value.visibility || 'PRIVATE'
    };
  }
}

// 取消编辑
function cancelEdit() {
  isEditMode.value = false;
  reloadContent();
}

// 保存编辑
async function saveEdit() {
  uni.showLoading({ title: '保存中...' });
  try {
    const payload = {
      contentId: id.value,
      title: editForm.value.title,
      content: editForm.value.content,
      visibility: editForm.value.visibility
    };
    const res = await contentSvc.updateContent(payload);
    if (res.success) {
      uni.showToast({ title: '已保存', icon: 'success' });
      isEditMode.value = false;
      reloadContent();
    } else {
      uni.showToast({ title: res.data?.message || '保存失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: e.message || '保存异常', icon: 'none' });
  } finally {
    uni.hideLoading();
  }
}

const editFormReady = computed(() => editForm.value.title.trim().length >= 2);

// 删除确认
async function confirmDelete() {
  uni.showModal({
    title: '确认删除？',
    content: '此操作不可恢复，请谨慎操作',
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '删除中...' });
        try {
          const r = await contentSvc.deleteContent(id.value);
          if (r.success) {
            uni.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => uni.navigateBack(), 800);
          } else {
            uni.showToast({ title: r.data?.message || '删除失败', icon: 'none' });
          }
        } catch (e) {
          uni.showToast({ title: e.message || '删除异常', icon: 'none' });
        } finally {
          uni.hideLoading();
        }
      }
    }
  });
}

// 分享
function shareContent() {
  uni.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline']
  });
  
  uni.showActionSheet({
    itemList: ['分享给好友', '分享到朋友圈', '复制链接'],
    success: (res) => {
      if (res.tapIndex === 0) {
        // 分享到好友（需调用 wx.shareAppMessage）
        console.log('Share to friend');
      } else if (res.tapIndex === 1) {
        console.log('Share to timeline');
      } else {
        uni.setClipboardData({
          data: `/pkg-content/pages/content/detail?id=${id.value}`,
          success: () => uni.showToast({ title: '链接已复制', icon: 'success' })
        });
      }
    }
  });
}

// 重新加载
async function reloadContent() {
  await loadContent();
}

const visibilityOpts = [
  { label: '仅自己可见', value: 'PRIVATE' },
  { label: '指定可见', value: 'GROUP' },
  { label: '公开', value: 'PUBLIC' }
];

function onVisibilityChange(e: any) {
  editForm.value.visibility = e.detail.value as Visibility;
}

onLoad((q: any) => {
  id.value = q?.id || '';
});

onMounted(() => {
  if (id.value) loadContent();
});
</script>

<style scoped lang="scss">
.detail-page { min-height: 100vh; background: var(--home-bg); padding-bottom: 64px; }

.page-header {
  padding: 24px 16px 12px;
  text-align: center;
  
  .page-title { font-size: 24px; font-weight: bold; color: var(--home-text); }
  .page-subtitle { display: block; margin-top: 4px; font-size: 14px; color: var(--home-text-2); }
}

.loading-state, .error-state {
  text-align: center;
  margin-top: 120px;
  
  .spinner, .error-icon { font-size: 48px; display: block; }
  .hint, .error-text { display: block; margin-top: 16px; font-size: 16px; color: var(--home-text-2); }
  
  .retry-btn {
    margin-top: 24px;
    padding: 12px 32px;
    border-radius: 8px;
    font-size: 14px;
    background: linear-gradient(135deg, #D4B06A, #C9A063);
    color: white;
  }
}

.content-viewer {
  padding: 0 16px;
  
  .media-area {
    width: 100%;
    height: 300px;
    background: var(--home-card);
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 16px;
    
    .swipe-img, .single-media { width: 100%; height: 100%; object-fit: contain; }
  }
  
  .text-area {
    .content-title { font-size: 18px; font-weight: bold; color: var(--home-text); display: block; margin-bottom: 8px; }
    .content-meta { font-size: 12px; color: var(--home-text-2); display: block; margin-bottom: 12px; }
    .content-body { font-size: 14px; line-height: 1.6; color: var(--home-text); word-break: break-word; }
    .empty-content { color: var(--home-text-2); font-style: italic; }
  }
  
  .category-section {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 16px 0;
    
    .cat-chip {
      padding: 4px 12px;
      background: var(--home-gold);
      color: white;
      border-radius: 16px;
      font-size: 12px;
    }
    
    .tag-chip {
      padding: 4px 12px;
      background: var(--home-line);
      border-radius: 16px;
      font-size: 12px;
      color: var(--home-text-2);
    }
  }
  
  .visibility-badge {
    text-align: right;
    margin-top: 16px;
    font-size: 12px;
    color: var(--home-text-2);
  }
}

.toolbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  background: var(--home-bg);
  border-top: 1px solid var(--home-line);
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  .tool-left {
    display: flex;
    gap: 12px;
    
    .tool-btn {
      padding: 8px 16px;
      background: var(--home-card);
      border-radius: 8px;
      font-size: 14px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      
      &.secondary { color: var(--home-text-2); }
    }
  }
  
  .tool-right {
    .action-btn {
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      background: #FF5252;
      color: white;
    }
  }
}

.edit-mode {
  margin: 16px;
  padding: 16px;
  background: var(--home-card);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  
  .input-field {
    width: 100%;
    padding: 12px;
    margin-bottom: 12px;
    background: white;
    border-radius: 8px;
    font-size: 14px;
    
    &.textarea { min-height: 120px; line-height: 1.6; }
  }
  
  .visibility-row {
    padding: 12px;
    margin-bottom: 12px;
    background: var(--home-card-2);
    border-radius: 8px;
    
    .cat-label { display: block; font-size: 14px; color: var(--home-text-2); margin-bottom: 8px; }
    
    .radio-item {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      
      radio { transform: scale(0.8); }
      text { margin-left: 8px; font-size: 14px; color: var(--home-text); }
    }
  }
  
  .save-actions {
    display: flex;
    gap: 12px;
    margin-top: 16px;
    
    button {
      flex: 1;
      padding: 12px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      
      &.cancel-btn {
        background: var(--home-line);
        color: var(--home-text-2);
      }
      
      &.save-btn {
        background: linear-gradient(135deg, #D4B06A, #C9A063);
        color: white;
        
        &.disabled {
          opacity: 0.5;
          pointer-events: none;
        }
      }
    }
  }
}
</style>