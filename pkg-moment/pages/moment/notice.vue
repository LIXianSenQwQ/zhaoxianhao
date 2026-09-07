<!--
  pkg-moment/pages/moment/notice.vue — 家族公告（蓝图 V2.0 §29 C.6）
  数据：listNotices / publishAnnounce / stickNotice / readReceipt
-->
<template>
  <view class="notice-page">
    <!-- 提示：仅 CHIEF+ 可发布 -->
    <view class="tips" v-if="!isChf">公告发布需要族长权限。如需发布公告请联系管理员。</view>
    <button v-if="isChf" class="new-btn" size="mini" @click="showPublish=true">＋发布公告</button>
    <!-- 列表 -->
    <view v-if="loading" class="sk-list"><view v-for="i in 10" :key="i" class="sk-card"/></view>
    <template v-else>
      <view v-for="n of list" :key="n._id" class="card">
        <view class="hd">
          <text class="priority" :class="n.priority">{{ n.priorityText || n.priority }}</text>
          <text class="time">{{ fmtTime(n.publishAt) }}</text>
        </view>
        <text class="title">{{ n.title }}</text>
        <text class="ct">{{ n.content }}</text>
        <view class="ft">
          <text class="badge" v-if="n.requiresReadReceipt">需回执</text>
          <text>{{ n.status || '已发布' }}</text>
          <view v-if="isChf" class="chf-actions">
            <text @click="stick(n)">置顶</text>
            <text class="del" @click="deleteOne(n)">删除</text>
          </view>
          <text v-else @click.stop="doRead(n)">已读</text>
        </view>
      </view>
      <view v-if="!list.length" class="empty">暂无公告</view>
    </template>
  </view>
  <!-- 发布弹窗 -->
  <view v-if="showPublish" class="mask" @click="showPublish=false">
    <view class="dialog" @click.stop>
      <input class="inp" v-model="form.title" placeholder="标题" maxlength="50"/>
      <textarea class="area" v-model="form.content" placeholder="内容（≤5000 字）" maxlength="5000" auto-height/>
      <view class="select-row">
        <text class="lbl">分类：</text>
        <scroll-view scroll-x class="chips">
          <text v-for="c of NOTICES_CATS" :key="c" :class="{active:form.category===c}" @click="form.category=c">{{ c }}</text>
        </scroll-view>
      </view>
      <view class="select-row">
        <text class="lbl">优先级：</text>
        <view class="priority-chips">
          <text v-for="p of ['low','normal','high','urgent']" :key="p" :class="{active:form.priority===p}" @click="form.priority=p">{{ p }}</text>
        </view>
      </view>
      <view class="btns"><button class="ok" @click="create()">发布</button><button class="sec" @click="showPublish=false">取消</button></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { listNotices, publishAnnounce, stickNotice, readReceipt } from '@/services/moment';
import { useUserStore } from '@/stores/user';

const store = useUserStore();
const isChf = computed(() => store.userInfo?.role === 'CHIEF');
const STORAGE_KEY='hcs:cache:user:id'; const myId=uni.getStorageSync(STORAGE_KEY)||'';
const loading=ref(true); const list=ref<any[]>([]); const showPublish=ref(false); const form=ref<{title:string; content:string; category:string; priority:string}>({title:'', content:'', category:'族务', priority:'normal'});
const NOTICES_CATS=['族务','红白事','节庆','应急','公示'];

onMounted(async ()=>{ await load(); });

async function load(){ loading.value=true; const r=await listNotices(1,10); list.value=(r.data?.notices|| []).map(n=>({ ...n, priorityText:priorities[n.priority], wasRead:n.readBy?.some(r=>r.userId===myId)})); loading.value=false; }

async function create(){ if(!form.value.title.trim()||!form.value.content.trim()) return uni.showToast({title:'标题/内容必填',icon:'none'}); const r=await publishAnnounce(form.value); if(r.error){ uni.showToast({title:'发布失败',icon:'none'}); return; } uni.showToast({title:'公告已发布',icon:'success'}); showPublish.value=false; form.value={title:'',content:'',category:'族务',priority:'normal'}; await load(); }

async function doRead(n:any){ await readReceipt(n._id); list.value=list.value.map(x=>x._id===n._id ? {...x,wasRead:true} : x); }
function stick(n:any){ alert(`置顶${n.title}`); /* stub */ }
function deleteOne(n:any){ if(confirm('确认删除？')){/* stub */ } }
function fmtTime(ts?:string){ if(!ts) return ''; const d=new Date(ts); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }

const priorities:Record<string,string>={low:'低优先级', normal:'普通', high:'重要', urgent:'紧急'};
</script>

<style lang="scss" scoped>
.notice-page{ min-height:100vh; background:#FAF8F2; padding:16px; box-sizing:border-box; }
.tips{ font-size:13px; color:#6E6659; background:#FFF; padding:10px; border-radius:8px; margin-bottom:12px; }
.new-btn{ background:#B03A2E; color:#FFF; font-size:14px; padding:8px 16px; border-radius:6px; border:none; margin-bottom:12px; }
.sk-list{ display:flex; flex-direction:column; gap:8px; }
.sk-card{ height:100px; background:#FFF; border-radius:12px; }
.card{ background:#FFF; border-radius:12px; padding:12px; margin-bottom:12px; box-shadow:0 2px 12px rgba(38,34,30,.06);}
.hd{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
.priority{ font-size:11px; color:#FFF; padding:2px 6px; border-radius:4px; }
.priority.low{ background:#7FA8A0; } .priority.normal{ background:#C9A063; } .priority.high{ background:#C9A063; } .priority.urgent{ background:#B03A2E; }
.time{ font-size:11px; color:#999; }
.title{ font-size:16px; font-weight:600; line-height:1.3; color:#2B2723; display:block; margin-bottom:6px; }
.ct{ font-size:14px; color:#6E6659; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; display:block; margin-bottom:8px; }
.ft{ display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#999; }
.badge{ font-size:11px; padding:2px 4px; background:#EDF5F4; color:#7FA8A0; border-radius:4px; margin-right:4px; }
.chf-actions{ display:flex; gap:12px; }
.chf-actions .del{ color:#B03A2E; }
.empty{text-align:center; padding:60px 0; color:#CCC; }
.mask{ position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,.4); z-index:999; display:flex; align-items:center; justify-content:center; }
.dialog{ background:#FFF; border-radius:12px; padding:16px; width:80%; max-width:350px; max-height:80vh; overflow-y:auto; }
.inp{ width:100%; padding:8px; border:1px solid #EAE4D6; border-radius:6px; font-size:14px; margin-bottom:8px; box-sizing:border-box;}
.area{ width:100%; padding:8px; border:1px solid #EAE4D6; border-radius:6px; font-size:14px; margin-bottom:8px; min-height:100px; box-sizing:border-box; }
.select-row{ margin-bottom:8px; }
.lbl{ font-size:13px; color:#333; margin-right:8px; }
.chips{ white-space:nowrap; overflow-x:auto; }
.chips .active{ background:#B03A2E; color:#FFF; }
.chips text{ display:inline-block; padding:4px 8px; background:#F0EFEA; border-radius:16px; margin-right:4px; font-size:12px; }
.priority-chips{ display:flex; gap:4px; }
.priority-chips text{ padding:4px 10px; background:#F0EFEA; border-radius:16px; margin-right:4px; font-size:11px; }
.btns{ display:flex; justify-content:space-between; margin-top:12px; }
.btns button{ padding:8px; border-radius:6px; border:none; }
.btns .ok{ background:#B03A2E; color:#FFF; }
.btns .sec{ background:#EEE; }
</style>
