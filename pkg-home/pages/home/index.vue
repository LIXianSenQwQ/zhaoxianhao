<template>
  <view class="home-page">
    <!-- 顶部家园信息 -->
    <view class="world-header">
      <view class="level-pill">Lv.{{ world.level }}</view>
      <view class="header-main">
        <text class="world-name">{{ worldName }}</text>
        <view class="exp-bar">
          <view class="exp-fill" :style="{ width: world.progressPct + '%' }"></view>
        </view>
        <text class="exp-text">经验 {{ world.experience }} / {{ world.expNext }}（{{ world.progressPct }}%）</text>
      </view>
    </view>

    <!-- 建筑目录 -->
    <scroll-view scroll-x class="catalog-scroll">
      <view class="catalog-inner">
        <view
          v-for="b in buildingCatalog"
          :key="b.key"
          class="catalog-chip"
          :class="{ locked: world.level < b.unlockLv }"
          @tap="selectCatalog(b)"
        >
          <text class="chip-name">{{ b.name }}</text>
          <text class="chip-size">{{ b.w }}×{{ b.h }}</text>
          <text class="chip-lv" v-if="world.level < b.unlockLv">Lv{{ b.unlockLv }} 解锁</text>
        </view>
      </view>
    </scroll-view>

    <!-- 庭院网格 -->
    <view class="grid-panel">
      <view v-for="idx in GRID.h" :key="'row' + idx" class="grid-row">
        <view
          v-for="idx2 in GRID.w"
          :key="'cell' + idx2"
          class="grid-cell"
          :class="cellClass(idx2 - 1, idx - 1)"
          @tap="placeAt(idx2 - 1, idx - 1)"
        ></view>
      </view>
    </view>

    <!-- 当前选中预览 -->
    <view class="place-bar" v-if="pendingPlacement">
      <text class="place-tip">放置「{{ pendingPlacement.name }}」：点网格落位（{{ pendingPlacement.w }}×{{ pendingPlacement.h }}）</text>
      <text class="place-cancel" @tap="cancelPlacement">取消</text>
    </view>

    <!-- 已建建筑清单 -->
    <view class="built-section" v-if="world.buildings.length">
      <text class="section-title">已建建筑（{{ world.buildings.length }}）</text>
      <view v-for="(b, i) in world.buildings" :key="i" class="built-row">
        <text class="built-name">{{ labelOf(b.type) }}</text>
        <text class="built-pos">@({{ b.x }}, {{ b.y }})</text>
        <text class="built-del" @tap="removeBuilding(i)">移除</text>
      </view>
    </view>

    <!-- 成长按钮 -->
    <view class="action-bar">
      <button class="act-btn" @tap="addExperience(30)">家族打卡 +30</button>
      <button class="act-btn" @tap="addExperience(15)">答题 +15</button>
      <button class="act-btn ghost" @tap="setPrivacyToggle">可见：{{ privacyLabel }}</button>
    </view>

    <!-- 合规声明 -->
    <view class="comp-tip">
      <text class="comp-text">虚拟家园 · 零内购 · 成长仅来自家族行为</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import {
  GRID, BUILDING_CATALOG, PRIVACY,
  growHome, validatePlacement, canPlaceBuilding, privacyScope
} from '@/utils/home-engine.js';
import { worldInit, worldPlace, worldGrow, worldSetPrivacy } from '@/services/home';

const worldName = ref('郝氏·我的家园');
const privacy = ref(PRIVACY.FAMILY);
const world = reactive<any>({
  level: 1, experience: 0, expNext: 50, progressPct: 0,
  buildings: [] as any[], decorations: []
});
const pendingPlacement = ref<any>(null);
const loadedFromCloud = ref(false);

onMounted(loadWorld);

async function loadWorld() {
  try {
    const res = await worldInit();
    const w = res.data?.world;
    if (w) {
      world.level = w.level;
      world.experience = w.experience;
      world.expNext = w.expNext ?? 50;
      world.progressPct = w.progressPct ?? 0;
      world.buildings = w.buildings || [];
      world.decorations = w.decorations || [];
      if (w.privacy) privacy.value = w.privacy;
      loadedFromCloud.value = true;
    }
  } catch (e: any) {
    // 云端不可用时仍可本地体验（纯函数引擎兜底）
    loadedFromCloud.value = false;
  }
}

const buildingCatalog = computed(() =>
  Object.keys(BUILDING_CATALOG).map(k => ({ key: k, ...BUILDING_CATALOG[k] }))
);
const privacyLabel = computed(() =>
  privacy.value === PRIVACY.SELF ? '仅自己' : privacy.value === PRIVACY.FAMILY ? '家庭可见' : '家族可见'
);

function labelOf(type: string): string {
  const b = BUILDING_CATALOG[type];
  return b ? b.name : type;
}

function selectCatalog(b: any) {
  const chk = canPlaceBuilding({ type: b.key, level: world.level });
  if (!chk.ok) {
    uni.showToast({ title: chk.error || '未解锁', icon: 'none' });
    return;
  }
  pendingPlacement.value = { key: b.key, name: b.name, w: b.w, h: b.h };
}

function cancelPlacement() {
  pendingPlacement.value = null;
}

function cellClass(x: number, y: number): string {
  const b = world.buildings.find((it: any) =>
    it.x <= x && x < it.x + (it.w || 1) && it.y <= y && y < it.y + (it.h || 1)
  );
  if (b) return 'occupied building-' + b.type;
  return '';
}

/** 本地纯函数校验 + 落位（乐观更新），云端持久化由 home 云函数接管 */
function placeAt(x: number, y: number) {
  if (!pendingPlacement.value) return;
  const chk = validatePlacement({
    type: pendingPlacement.value.key,
    x, y,
    existing: { buildings: world.buildings, decorations: world.decorations }
  });
  if (!chk.ok) {
    uni.showToast({ title: chk.error || '无法放置', icon: 'none' });
    return;
  }
  const b = {
    type: pendingPlacement.value.key,
    x, y,
    w: chk.footprint!.w, h: chk.footprint!.h,
    placedAt: new Date().toISOString()
  };
  world.buildings.push(b);
  pendingPlacement.value = null;
  uni.showToast({ title: '建造成功', icon: 'success' });
  if (loadedFromCloud.value) {
    worldPlace(b.type, x, y).catch(() => {
      uni.showToast({ title: '云端同步失败，将重试', icon: 'none' });
    });
  }
}

function removeBuilding(i: number) {
  world.buildings.splice(i, 1);
  // 注：正式版提供云端建筑移除 action 后在此补同步
}

function addExperience(gain: number) {
  const r = growHome({ level: world.level, experience: world.experience }, gain);
  world.level = r.level;
  world.experience = r.experience;
  world.expNext = r.expNext;
  world.progressPct = r.progressPct;
  if (r.leveledUp) uni.showToast({ title: `家园升级 Lv.${r.level}！`, icon: 'none' });
  if (loadedFromCloud.value) {
    worldGrow(gain).catch(() => {
      uni.showToast({ title: '成长同步失败，将重试', icon: 'none' });
    });
  }
}

function setPrivacyToggle() {
  const order = [PRIVACY.FAMILY, PRIVACY.SELF, PRIVACY.CLAN];
  const cur = order.indexOf(privacy.value);
  const next = order[(cur + 1) % order.length];
  const v = privacyScope(next);
  if (!v.ok) return;
  privacy.value = next;
  if (loadedFromCloud.value) {
    worldSetPrivacy(next as 'SELF' | 'FAMILY' | 'CLAN').catch(() => {
      uni.showToast({ title: '可见性同步失败', icon: 'none' });
    });
  }
}
</script>

<style scoped>
.home-page { flex: 1; min-height: 100vh; background: #FAF8F2; padding: 16px; box-sizing: border-box; }

.world-header { display: flex; gap: 12px; background: linear-gradient(135deg, #7FA8A0, #5F8B83); border-radius: 14px; padding: 16px; color: #FFF; align-items: center; }
.level-pill { background: rgba(255,255,255,0.25); border-radius: 10px; padding: 10px 8px; font-weight: 700; font-size: 16px; }
.header-main { flex: 1; }
.world-name { display: block; font-size: 17px; font-weight: 700; }
.exp-bar { height: 8px; background: rgba(255,255,255,0.3); border-radius: 4px; margin: 8px 0 4px; overflow: hidden; }
.exp-fill { height: 100%; background: #F4C76E; border-radius: 4px; transition: width 0.3s; }
.exp-text { font-size: 11px; opacity: 0.9; }

.catalog-scroll { margin: 14px -16px 10px; padding: 0 16px; }
.catalog-inner { display: flex; gap: 10px; padding-bottom: 4px; }
.catalog-chip { flex-shrink: 0; background: #FFF; border: 1px solid #E8DFD0; border-radius: 10px; padding: 8px 12px; text-align: center; }
.catalog-chip.locked { opacity: 0.55; }
.chip-name { display: block; font-size: 14px; font-weight: 600; color: #2B2723; }
.chip-size { display: block; font-size: 10px; color: #8A867F; }
.chip-lv { display: block; font-size: 10px; color: #B03A2E; }

.grid-panel { background: #E7DCC7; border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 2px; }
.grid-row { display: flex; gap: 2px; }
.grid-cell { flex: 1; aspect-ratio: 1.6; background: #F3EBDD; border-radius: 3px; max-height: 34px; }
.grid-cell.occupied { background: #B03A2E; }
.grid-cell.building-pearGarden { background: #C98A7C; }
.grid-cell.building-shrine { background: #8C6D5A; }
.grid-cell.building-study { background: #A9B7A5; }
.grid-cell.building-stage { background: #C9B18C; }
.grid-cell.building-archway { background: #B8915A; }

.place-bar { display: flex; align-items: center; background: #FBF3E8; border-radius: 10px; padding: 10px 14px; margin-top: 10px; }
.place-tip { flex: 1; font-size: 13px; color: #A8783B; }
.place-cancel { font-size: 13px; color: #B03A2E; font-weight: 600; }

.built-section { background: #FFF; border-radius: 12px; padding: 12px; margin-top: 12px; }
.section-title { display: block; font-size: 14px; font-weight: 600; color: #2B2723; margin-bottom: 8px; }
.built-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #F3EFE6; }
.built-name { flex: 1; font-size: 14px; }
.built-pos { font-size: 12px; color: #8A867F; }
.built-del { font-size: 12px; color: #B03A2E; }

.action-bar { display: flex; gap: 8px; margin-top: 12px; }
.act-btn { flex: 1; background: #B03A2E; color: #FFF; border-radius: 8px; font-size: 13px; }
.act-btn.ghost { background: #F3EDE3; color: #5A5348; }

.comp-tip { background: #FBF3E8; border-radius: 8px; padding: 8px 12px; margin-top: 12px; text-align: center; }
.comp-text { font-size: 12px; color: #A8783B; }
</style>
