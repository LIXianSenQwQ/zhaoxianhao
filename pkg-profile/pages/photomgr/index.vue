<!--
  pkg-profile/pages/photomgr/index.vue — 我的相册（蓝图 V1.1 §22.3 多级相册 + 批量上传）
  数据：album.list(scope='mine') → { albums[], total }
  交互：
    · 展示个人相册列表（含照片数/层级/可见性）
    · 新建相册：名称 + 可见性 + 父相册（下拉选择已有相册）
    · 选中相册上传照片：multi chooseImage → wx.cloud.uploadFile each → album.uploadBatch(≤20 张/次)
-->
<template>
  <view class="album-page">
    <!-- 我的相册列表 -->
    <view class="card-list">
      <text class="section-title">我的相册（{{ albums.length }}）</text>
      <scroll-view class="scroll-box" scroll-y>
        <view v-for="a in albums" :key="a._id || a.name + Math.random()" class="album-card" @click="selectAlbum(a._id)">
          <view class="ac-top">
            <image class="thumb" v-if="false" src="" mode="aspectFill" /> <!-- TODO：封面 -->
            <view class="ac-info">
              <text class="ac-name">{{ a.name }}</text>
              <text class="ac-meta">{{ a.photoCount || 0 }}张照片 · {{ levelLabel(a.level) }}</text>
            </view>
            <text class="ac-viz" :class="a.visibility === 'PUBLIC' ? 'public' : 'private'">{{ vizText(a.visibility) }}</text>
          </view>
          <view class="ac-btm">
            <text class="ac-action" @click.stop="openCreateSub(a._id)">新建子相册</text>
            <text class="ac-upload" :style="{ opacity: selectedAlbumId === a._id ? 1 : .6 }" @click.stop="uploadPhoto">
              {{ selectedAlbumId === a._id ? '换一批' : '选择上传' }}
            </text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 新建相册表单 -->
    <view v-show="showCreateForm" class="form-wrap">
      <text class="form-title">新建相册</text>
      <view class="field">
        <text class="field-label">相册名<span class="required">*</span></text>
        <input class="field-input" v-model="createForm.name" placeholder="如：家族庆典·2025" maxlength="50" />
      </view>
      <view class="field">
        <text class="field-label">可见性</text>
        <picker mode="selector" :range="vizList" :range-key="'label'" :value="createForm.visibilityIndex" @change="onVizChange">
          <view class="picker-value">{{ vizList[createForm.visibilityIndex]?.label || '私有' }}</view>
        </picker>
      </view>
      <view class="field" v-if="albums.length">
        <text class="field-label">父相册</text>
        <view class="empty-tip">暂无上级（根级相册）</view>
      </view>
      <view class="form-actions">
        <button class="cancel-btn" @click="showCreateForm = false">取消</button>
        <button class="save-btn" :disabled="saving" @click="createAlbum">保存</button>
      </view>
    </view>

    <!-- 上传遮罩 -->
    <view v-if="uploading" class="upload-overlay">
      <view class="upload-modal">
        <text class="upload-t">上传照片至 {{ selectedAlbum?.name || '相册' }}</text>
        <view class="upload-actions">
          <button class="choose-btn" @click="doChoose">选择照片</button>
          <button class="close-btn" @click="uploading = false">关闭</button>
        </view>
        <text class="upload-note">单次最多上传 20 张（云端压缩 + 缩略图生成）。</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { call } from '@/services/request';

interface Album { _id?: string; name: string; photoCount?: number; level?: number; visibility?: string; userId?: string }

const albums = ref<Album[]>([]);
const loading = ref(true);
const selectedAlbumId = ref('');
const selectedAlbum = ref<Album | null>(null);
const uploading = ref(false);
const saving = ref(false);
const showCreateForm = ref(false);
const createForm = ref({ name: '', visibilityIndex: 0 });

const vizList = [
  { label: '私有（仅本人可见）', val: 'PRIVATE' },
  { label: '公开（族人群可见）', val: 'PUBLIC' },
  { label: '家庭（房支可见）', val: 'GROUP' }
];

async function load() {
  loading.value = true;
  const res = await call('album', { action: 'list', scope: 'mine' }, undefined);
  loading.value = false;
  if (res.data?.albums) albums.value = res.data.albums;
}
onShow(load);

function selectAlbum(id: string) {
  selectedAlbumId.value = id;
  selectedAlbum.value = albums.value.find(a => a._id === id) || null;
}
function openCreateSub(parentId?: string) {
  showCreateForm.value = true;
  // parentId 暂不支持父子关联，待扩展
}
function levelLabel(l: number) {
  return l >= 4 ? '深层级' : l >= 2 ? '子相册' : '根相册';
}
function vizText(v?: string) {
  return (v || 'PRIVATE') === 'PUBLIC' ? '公开' : '私有';
}
function onVizChange(e: any) {
  const i = Number(String(e.detail.value).split('=')[1] || 0);
  createForm.value.visibilityIndex = i;
}
async function doChoose() {
  const chosen = await new Promise<string[]>((resolve) => {
    uni.chooseImage({ count: 9, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: (res) => resolve(res.tempFilePaths), fail: () => resolve([]) });
  });
  if (!chosen.length) return uploading.value = false;
  await uploadToCloud(chosen);
}
async function uploadPhoto() {
  if (!selectedAlbumId.value) return uni.showToast({ title: '请先选择相册', icon: 'none' });
  uploading.value = true;
  const chosen = await new Promise<string[]>((resolve) => {
    uni.chooseImage({ count: 9, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: (res) => resolve(res.tempFilePaths), fail: () => resolve([]) });
  });
  if (!chosen.length) return uploading.value = false;
  await uploadToCloud(chosen);
}
async function uploadToCloud(paths: string[]) {
  const wxCtx: any = (globalThis as any).wx;
  if (!wxCtx || !wxCtx.cloud || typeof wxCtx.cloud.uploadFile !== 'function') {
    return uni.showToast({ title: '请在微信端上传', icon: 'none' });
  }
  const ext = (paths[0].split('.').pop() || 'jpg').toLowerCase();
  const photos = [];
  for (const p of paths) {
    const cloudPath = `photos/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
    const upRes: any = await new Promise((r) => wxCtx.cloud.uploadFile({ cloudPath, filePath: p, success: r, fail: () => r(null) }));
    if (!upRes || !upRes.fileID) continue;
    photos.push({ fileId: upRes.fileID, shotAt: Date.now() });
    if (photos.length >= 20) break; // 单次上限
  }
  if (!photos.length) return uni.showToast({ title: '上传无有效照片', icon: 'none' });
  const res: any = await new Promise(r => call('album', { action: 'uploadBatch', albumId: selectedAlbumId.value, photos }, undefined, r));
  if (res.data?.photoIds) uni.showToast({ title: `成功 ${res.data.count} 张`, icon: 'success' }); else uni.showToast({ title: '上传失败', icon: 'none' });
  uploading.value = false;
  load();
}

async function createAlbum() {
  if (!createForm.value.name.trim()) return uni.showToast({ title: '请设相册名', icon: 'none' });
  saving.value = true;
  const res = await call('album', { action: 'save', name: createForm.value.name, visibility: vizList[createForm.value.visibilityIndex].val }, undefined);
  saving.value = false;
  if (res.data?.albumId) {
    uni.showToast({ title: '相册已创建', icon: 'success' });
    showCreateForm.value = false;
    load();
  } else {
    uni.showToast({ title: (res.error as any)?.message || '创建失败', icon: 'none' });
  }
}
</script>

<style lang="scss" scoped>
.album-page { min-height: 100vh; background: #FAF8F2; padding: 16px 12px 32px; box-sizing: border-box; }
.section-title { display: block; font-size: 14px; font-weight: 700; color: #2B2723; margin-bottom: 10px; letter-spacing: 1px; }
.card-list { background: #FFF; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; box-shadow: 0 2px 12px rgba(38,34,30,.06); }
.scroll-box { max-height: 600px; }
.album-card { border-radius: 10px; padding: 12px 10px; background: #F7F4EC; margin-bottom: 10px; transition: transform .2s ease; active:scale(.98) }
.ac-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.thumb { width: 48px; height: 48px; border-radius: 6px; background: #EAE4D8; flex-shrink: 0; }
.ac-info { flex: 1; }
.ac-name { display: block; font-size: 15px; font-weight: 600; color: #2B2723; }
.ac-meta { display: block; font-size: 11px; color: #8A7B5A; margin-top: 4px; }
.ac-viz { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.ac-viz.public { color: #2E6B46; background: #ECF2EF; }
.ac-viz.private { color: #8A6D3B; background: #F4EDDD; }
.ac-btm { display: flex; justify-content: space-between; }
.ac-action, .ac-upload { font-size: 12px; color: #8A6D3B; cursor: pointer; }
.form-wrap { background: #FFF; border-radius: 12px; padding: 16px; margin-top: 12px; box-shadow: 0 2px 12px rgba(38,34,30,.06); }
.form-title { display: block; font-size: 14px; font-weight: 700; color: #2B2723; margin-bottom: 12px; }
.field { margin-bottom: 12px; }
.field-label { display: block; font-size: 12px; color: #6E6659; margin-bottom: 6px; }
.required { color: #B03A2E; }
.field-input { background: #FAF8F2; border-radius: 8px; padding: 10px; font-size: 13px; color: #2B2723; }
.picker-value { padding: 10px 12px; background: #F7F4EC; border-radius: 6px; font-size: 14px; color: #2B2723; text-align: center; }
.empty-tip { padding: 10px; color: #B0A99A; font-size: 12px; }
.form-actions { display: flex; gap: 12px; }
.cancel-btn, .save-btn { flex: 1; height: 42px; line-height: 42px; font-size: 14px; border-radius: 8px; text-align: center; padding: 0; }
.cancel-btn { background: #FFF; color: #8A7B5A; border: 1px solid #EAE4D6; }
.save-btn { background: #B03A2E; color: #FFF; }
.upload-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 999; }
.upload-modal { background: #FFF; border-radius: 12px; padding: 16px 20px; width: 260px; }
.upload-t { display: block; font-size: 14px; font-weight: 700; color: #2B2723; margin-bottom: 12px; }
.upload-actions { display: flex; gap: 12px; margin-bottom: 8px; }
.choose-btn, .close-btn { flex: 1; height: 38px; line-height: 38px; font-size: 13px; border-radius: 8px; text-align: center; padding: 0; }
.choose-btn { background: #B03A2E; color: #FFF; }
.close-btn { background: #F7F4EC; color: #8A7B5A; }
.upload-note { display: block; font-size: 11px; color: #B0A99A; line-height: 1.6; text-align: center; }
</style>
