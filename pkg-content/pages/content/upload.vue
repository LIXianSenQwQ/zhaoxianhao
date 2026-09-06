<template>
  <view class="upload-page">
    <!-- 顶部导航 -->
    <view class="page-header">
      <text class="page-title">上传内容</text>
      <text class="page-subtitle">{{ typeLabel }}</text>
    </view>

    <!-- 媒体选择区 -->
    <view class="media-section">
      <scroll-view scroll-x class="type-tabs" @click.stop>
        <view 
          v-for="t in types" 
          :key="t.value"
          class="tab-chip"
          :class="{ active: currentType === t.value }"
          @click="switchType(t.value)"
        >
          <text>{{ t.label }}</text>
        </view>
      </scroll-view>

      <view class="selector-grid">
        <view class="select-card" v-if="currentType === 'photo'" @click="choosePhoto">
          <text class="icon">🖼️</text>
          <text class="label">选照片</text>
          <text class="hint">单张≤20MB · HEIC/JPG/PNG</text>
        </view>
        <view class="select-card" v-if="currentType === 'video'" @click="chooseVideo">
          <text class="icon">🎥</text>
          <text class="label">选视频</text>
          <text class="hint">单文件≤2GB · MP4/MOV · 建议≤10min</text>
        </view>
        <view class="select-card" v-if="currentType === 'record'" @click="startRecord">
          <text class="icon">📝</text>
          <text class="label">写记录</text>
          <text class="hint">生活记录/富文本 ≤20000 字</text>
        </view>
      </view>
    </view>

    <!-- 编辑区 -->
    <view class="editor-section" v-if="selectedItem">
      <view class="preview-area" v-if="previewUrl || tempFileId">
        <image 
          v-if="currentType !== 'record'"
          :src="previewUrl || tempFileId" 
          mode="aspectFit"
          lazy-load
          class="preview-img"
        />
      </view>

      <view class="edit-form">
        <input 
          v-model="form.title"
          placeholder="标题（必填）"
          class="input-field"
          maxlength="50"
        />
        
        <textarea 
          v-if="currentType === 'record'"
          v-model="form.content"
          placeholder="生活记录（必填）"
          class="input-field textarea"
          maxlength="20000"
        />

        <view class="cat-row">
          <text class="cat-label">主分类</text>
          <picker 
            range-category="main"
            :value="mainCatIndex"
            @change="onMainCatChange"
            class="picker"
          >
            <view class="picker-value">{{ form.mainCategory || '未选择' }}</view>
          </picker>
        </view>

        <view class="cat-row">
          <text class="cat-label">子分类</text>
          <picker 
            v-if="hasSubCats"
            range-category="sub"
            :value="subCatIndex"
            @change="onSubCatChange"
            class="picker"
          >
            <view class="picker-value">{{ form.subCategory || '无子分类' }}</view>
          </picker>
          <view v-else class="picker-value">无需选择</view>
        </view>

        <view class="tag-input">
          <text class="cat-label">标签</text>
          <view class="tags-row">
            <view class="tag-chip" v-for="(tag, i) in form.tags" :key="i">
              #{{ tag }}
              <text class="tag-remove" @click="removeTag(i)">×</text>
            </view>
            <view class="add-tag-btn" @click="showAddTag">＋</view>
          </view>
        </view>

        <view class="visibility-row">
          <text class="cat-label">可见性</text>
          <radio-group @change="onVisibilityChange">
            <label class="radio-item" v-for="v in visibilityOpts" :key="v.value">
              <radio :value="v.value" :checked="form.visibility === v.value" color="#B03A2E" />
              <text>{{ v.label }}</text>
            </label>
          </radio-group>
        </view>
      </view>
    </view>

    <!-- 工具条 -->
    <view class="toolbar">
      <view class="tool-left">
        <view class="tool-btn" @click="discard">
          <text>放弃</text>
        </view>
        <view class="tool-btn secondary" @click="saveAsDraft">
          <text>存草稿</text>
        </view>
      </view>
      <view class="tool-right">
        <button class="publish-btn" :class="{ disabled: !readyToPublish }" @click="publish">
          <text>{{ readyToPublish ? '发布' : '请补充必要信息' }}</text>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import * as contentSvc from '@/services/content';
import { call } from '@/services/request';

// 类型定义
type ContentType = 'photo' | 'video' | 'record';
type Visibility = 'PRIVATE' | 'GROUP' | 'PUBLIC';

const types = [
  { label: '照片', value: 'photo' },
  { label: '视频', value: 'video' },
  { label: '记录', value: 'record' }
];

const currentType = ref<ContentType>('photo');
const selectedItem = ref<{ fileUrl?: string; tempFileId?: string; blob?: Blob } | null>(null);
const previewUrl = ref('');
const tempFileId = ref('');

const title = ref('');
const content = ref('');
const mainCategory = ref('');
const subCategory = ref('');
const tags = ref<string[]>([]);
const visibility = ref<Visibility>('PRIVATE');

// 表单数据
const form = computed({
  get: () => ({
    type: currentType.value,
    title: title.value,
    content: content.value,
    mainCategory: mainCategory.value,
    subCategory: subCategory.value,
    tags: tags.value,
    visibility: visibility.value
  }),
  set: () => {} // 不可写回
});

const hasSubCats = computed(() => categoriesMap.value[mainCategory.value]?.length > 0);
const categoriesMap = ref<Map<string, any[]>>(new Map());
const categoryList = ref<any[]>([]);

// 切换类型
function switchType(t: ContentType) {
  currentType.value = t;
  selectedItem.value = null;
  previewUrl.value = '';
  tempFileId.value = '';
  title.value = '';
  content.value = '';
  tags.value = [];
}

const typeLabel = computed(() => types.find(t => t.value === currentType.value)?.label || '');

// 选择照片
async function choosePhoto() {
  uni.chooseMedia({
    count: 9,
    mediaType: ['image'],
    sizeType: ['original', 'compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      const file = res.tempFiles[0];
      if (!file.path && !file.tempFilePath) return;
      
      // iOS HEIC 处理：若扩展名为 .heic，先转 JPG
      const isHeic = file.path?.toLowerCase().endsWith('.heic') || false;
      let uploadPath = file.path;
      
      // 临时方案：若为 HEIC，调用 cloud.uploadFile 原样上传，后端 CI 转码
      tempFileId.value = await uploadTempFile(file.path!);
      previewUrl.value = file.tempFilePath;
      selectedItem.value = { tempFileId: tempFileId.value };
    },
    fail: () => uni.showToast({ title: '选图失败', icon: 'none' })
  });
}

// 选择视频
async function chooseVideo() {
  uni.chooseVideo({
    count: 1,
    sourceType: ['album', 'camera'],
    compressed: true,
    maxDuration: 600, // 60s 前端提示
    success: async (res) => {
      tempFileId.value = await uploadTempFile(res.tempFilePath);
      previewUrl.value = res.thumbTempFilePath;
      selectedItem.value = { tempFileId: tempFileId.value };
    },
    fail: () => uni.showToast({ title: '选视频失败', icon: 'none' })
  });
}

// 开始录音（占位）
function startRecord() {
  uni.showActionSheet({
    itemList: ['文字记录', '语音记录（开发中）'],
    success: () => { /* TODO: 录音功能 */ }
  });
}

// 临时文件上传（后端签名返回 tempFileID）
async function uploadTempFile(filePath: string): Promise<string> {
  const res = await call('upload', { action: 'policy', scene: 'content' });
  if (res.error) throw new Error(res.error.message || '上传政策获取失败');
  
  // 微信云存储上传（需 wx.cloud.uploadFile）
  try {
    // TODO: 实际使用 uniCloud 上传 API
    // 这里先用占位逻辑，待 uni-app 云函数部署后启用
    console.log('[Upload] policy:', res.data);
    return 'stub-temp-file-id-' + Date.now();
  } catch (e) {
    throw new Error('上传失败：' + e.message);
  }
}

// 分类加载
async function loadCategories() {
  const res = await contentSvc.listCategories();
  if (res.success) {
    categoryList.value = res.data.categories || [];
    buildCategoryMap();
  }
}

function buildCategoryMap() {
  const map = new Map<string, any[]>();
  for (const cat of categoryList.value) {
    if (cat.type === 'MAIN') {
      const key = cat.name;
      if (!map.has(key)) map.set(key, []);
    } else if (cat.type === 'SUB' && cat.parentId) {
      // 需要 parents 集合映射，此处简化：直接按 parentId 挂
      // 生产环境建议 pre-build parent->children 索引
      if (!map.has(cat.parentId)) map.set(cat.parentId, []);
      map.get(cat.parentId)!.push(cat);
    }
  }
  categoriesMap.value = map;
}

const mainCatIndex = computed(() => categoryList.value.filter(c => c.type === 'MAIN').findIndex(c => c.name === mainCategory.value));
const subCatIndex = computed(() => categoriesMap.value.get(mainCategory.value)?.findIndex(c => c.name === subCategory.value) ?? -1);

function onMainCatChange(e: any) {
  const mainList = categoryList.value.filter(c => c.type === 'MAIN');
  mainCategory.value = mainList[e.detail.value]?.name || '';
  subCategory.value = ''; // 清空子分类
}

function onSubCatChange(e: any) {
  const subs = categoriesMap.value.get(mainCategory.value);
  subCategory.value = subs?.[e.detail.value]?.name || '';
}

// 标签操作
function showAddTag() {
  uni.showModal({
    title: '添加标签',
    inputPlaceholder: '#输入标签',
    success: (res) => {
      if (res.confirm && res.confirmText?.trim()) {
        const t = '#' + res.confirmText.trim();
        if (!tags.value.includes(t)) tags.value.push(t);
      }
    }
  });
}

function removeTag(i: number) {
  tags.value.splice(i, 1);
}

// 可见性
const visibilityOpts = [
  { label: '仅自己可见', value: 'PRIVATE' },
  { label: '指定可见', value: 'GROUP' },
  { label: '公开', value: 'PUBLIC' }
];

function onVisibilityChange(e: any) {
  visibility.value = e.detail.value as Visibility;
}

// 发布
async function publish() {
  if (!readyToPublish.value) return;
  
  uni.showLoading({ title: '发布中...' });
  try {
    const payload = {
      ...form.value,
      mediaIds: tempFileId.value ? [tempFileId.value] : [] // 兼容多媒体制，暂只支持单
    };
    
    const res = await contentSvc.saveContent(payload);
    if (res.success) {
      uni.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => uni.navigateBack(), 800);
    } else {
      uni.showToast({ title: res.data?.message || '发布失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: e.message || '发布异常', icon: 'none' });
  } finally {
    uni.hideLoading();
  }
}

const readyToPublish = computed(() => {
  const hasTitle = title.value.trim().length >= 2;
  const hasContent = currentType.value === 'record' ? content.value.trim().length >= 2 : true;
  const hasMedia = currentType.value !== 'record' && tempFileId.value;
  return hasTitle && hasContent && hasMedia;
});

// 弃用/存草稿
function discard() { uni.navigateBack(); }
async function saveAsDraft() {
  uni.showLoading({ title: '保存草稿中...' });
  try {
    await contentSvc.saveContent({ ...form.value, status: 'DRAFT' });
    uni.showToast({ title: '已存草稿', icon: 'success' });
  } catch (e) {
    uni.showToast({ title: '保存失败', icon: 'none' });
  } finally {
    uni.hideLoading();
  }
}

onMounted(() => {
  loadCategories();
  // 从路由参数获取预设类型（可选）
  onLoad((q: any) => {
    if (q?.type) switchType(q.type as ContentType);
  });
});
</script>

<style scoped lang="scss">
.upload-page { min-height: 100vh; background: var(--home-bg); padding-bottom: 64px; }

.page-header {
  padding: 24px 16px 12px;
  text-align: center;
  
  .page-title { font-size: 24px; font-weight: bold; color: var(--home-text); }
  .page-subtitle { display: block; margin-top: 4px; font-size: 14px; color: var(--home-text-2); }
}

.media-section {
  padding: 0 16px;
  
  .type-tabs {
    white-space: nowrap;
    margin-bottom: 12px;
    
    .tab-chip {
      display: inline-block;
      padding: 6px 16px;
      margin-right: 8px;
      background: var(--home-card);
      border-radius: 20px;
      font-size: 14px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      
      &.active {
        background: linear-gradient(135deg, #D4B06A, #C9A063);
        color: white;
        font-weight: bold;
      }
    }
  }
  
  .selector-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    
    .select-card {
      background: var(--home-card);
      padding: 24px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 1px 6px rgba(0,0,0,0.04);
      
      .icon { font-size: 32px; display: block; }
      .label { display: block; font-size: 16px; font-weight: bold; color: var(--home-text); margin-top: 8px; }
      .hint { display: block; font-size: 12px; color: var(--home-text-2); margin-top: 4px; }
    }
  }
}

.editor-section {
  margin: 16px;
  
  .preview-area {
    width: 100%;
    height: 200px;
    background: var(--home-card-2);
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 16px;
    
    .preview-img { width: 100%; height: 100%; object-fit: contain; }
  }
  
  .edit-form {
    .input-field {
      width: 100%;
      padding: 12px;
      margin-bottom: 12px;
      background: var(--home-card);
      border-radius: 8px;
      font-size: 14px;
      
      &.textarea { min-height: 120px; line-height: 1.6; }
    }
    
    .cat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      margin-bottom: 12px;
      background: var(--home-card);
      border-radius: 8px;
      
      .cat-label { font-size: 14px; color: var(--home-text-2); }
      .picker { font-size: 14px; color: var(--home-text); }
    }
    
    .tag-input {
      padding: 12px;
      margin-bottom: 12px;
      background: var(--home-card);
      border-radius: 8px;
      
      .cat-label { display: block; font-size: 14px; color: var(--home-text-2); margin-bottom: 8px; }
      
      .tags-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        
        .tag-chip {
          position: relative;
          padding: 4px 8px;
          background: var(--home-accent);
          color: white;
          border-radius: 4px;
          font-size: 12px;
          
          .tag-remove {
            position: absolute;
            right: -6px;
            top: -6px;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #FF5252;
            color: white;
            font-size: 10px;
            text-align: center;
            line-height: 14px;
            cursor: pointer;
          }
        }
        
        .add-tag-btn {
          padding: 4px 8px;
          background: var(--home-line);
          border-radius: 4px;
          color: var(--home-text-2);
          font-size: 18px;
        }
      }
    }
    
    .visibility-row {
      padding: 12px;
      margin-bottom: 12px;
      background: var(--home-card);
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
    .publish-btn {
      padding: 12px 32px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: bold;
      background: linear-gradient(135deg, #D4B06A, #C9A063);
      color: white;
      
      &.disabled {
        opacity: 0.5;
        pointer-events: none;
      }
    }
  }
}
</style>