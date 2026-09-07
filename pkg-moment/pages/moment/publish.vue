<!--
  pkg-moment/pages/moment/publish.vue — 发布动态（蓝图 V2.0 §29 C.3）
  交互：文字(≤5000) / 图片≤9/话题标签选择 / 可见范围 / 发布到 family_moments
-->
<template>
  <view class="pub-page">
    <!-- 文字输入 -->
    <textarea class="area" v-model="text" placeholder="分享你的动态（≤5000 字）..." maxlength="5000"/>
    <view class="ft"><text>{{ text.length }}/5000</text></view>
    <!-- 图片选择 -->
    <view class="imgs">
      <view v-for="(url,i) of urls" :key="i" class="img-item">
        <image :src="url" mode="aspectFill"/>
        <text class="del-btn" @click="urls.splice(i,1)">×</text>
      </view>
      <view class="add-btn" @click="chooseImg()">＋图片</view>
    </view>
    <!-- 话题标签 -->
    <scroll-view scroll-x class="tags">
      <text v-for="tg of TAGS" :key="tg" :class="{active:selectedTags.includes(tg)}" @click="toggleTag(tg)">#{{ tg }}</text>
    </scroll-view>
    <!-- 发布 -->
    <button class="pub-btn" size="mini" :disabled="!text && !urls.length" @click="doPublish()">{{ saving?'发布中…':'发布' }}</button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { publishMoment } from '@/services/moment';

const TAGS=['族务','红白事','节庆','添丁','寿诞','升学','寻根','老照片','梨乡'];
let text=ref(''), urls=ref<string[]>([]), selectedTags=ref<string[]>([]), saving=ref(false);

async function chooseImg() {
  const count = 9 - urls.value.length;
  if (count <= 0) return uni.showToast({ title: '最多 9 张图片', icon: 'none' });
  try {
    const res: any = await uni.chooseImage({ count, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    if (!res.tempFilePaths?.length) return;
    // 上传到云存储（每张 < 200KB 压缩后）
    const uploaded: string[] = [];
    for (const localPath of res.tempFilePaths) {
      const uploadRes = await uni.cloud.uploadFile({
        cloudPath: `moments/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`,
        filePath: localPath
      });
      if (uploadRes.fileID) uploaded.push(uploadRes.fileID);
    }
    urls.value = [...urls.value, ...uploaded].slice(0, 9);
  } catch (e: any) {
    uni.showToast({ title: '选择图片失败', icon: 'none' });
  }
}

function toggleTag(t:string){ const i=selectedTags.value.indexOf(t); if(i>=0) selectedTags.value.splice(i,1); else selectedTags.value.push(t); }

async function doPublish(){ if(!text.value.trim() && !urls.value.length) return uni.showToast({title:'请输入内容',icon:'none'}); saving.value=true; try{ await publishMoment({type:'TEXT', content:text.value.trim(), mediaIds:urls.value.slice(0,9), topicTags:selectedTags.value}); uni.showToast({title:'发布成功',icon:'success'}); setTimeout(()=>history.back(),1000);}catch(e){ uni.showToast({title:'发布失败',icon:'none'}); } finally{saving.value=false;} }
</script>

<style lang="scss" scoped>
.pub-page{ min-height:100vh; background:#FAF8F2; padding:16px; box-sizing:border-box; }
.area{ width:100%; border:1px solid #EAE4D6; border-radius:12px; padding:12px; font-size:14px; line-height:1.6; min-height:160px; background:#FFF; margin-bottom:8px; }
.ft{ display:flex; justify-content:space-between; font-size:12px; color:#999; margin-bottom:12px; }
.imgs{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.img-item{ position:relative; width:80px; height:80px; border-radius:8px; overflow:hidden; }
.img-item image{ width:100%; height:100%; object-fit:cover; }
.del-btn{ position:absolute; top:4px; right:4px; width:16px; height:16px; background:rgba(0,0,0,.5); color:#FFF; text-align:center; line-height:16px; border-radius:50%; font-size:12px; }
.add-btn{ width:80px; height:80px; border:1px dashed #C9A063; color:#C9A063; display:flex; align-items:center; justify-content:center; border-radius:8px; font-size:14px; }
.tags{ white-space:nowrap; padding:8px 0; margin-bottom:12px; }
.tags .active{ background:#B03A2E; color:#FFF; }
.pub-btn{ width:100%; font-size:14px; padding:12px; background:#B03A2E; color:#FFF; border:none; border-radius:6px; margin-top:12px; }
</style>
