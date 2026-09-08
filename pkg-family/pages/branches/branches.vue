<template>
  <view class="page branch-page">
    <view class="header-bar">
      <text class="title">分支谱系</text>
      <button class="btn-create" @tap="showCreateDialog" v-if="canCreate">创建分支</button>
    </view>

    <view class="stats-bar" v-if="stats">
      <text class="stat-item">总分支 {{ stats.totalActive }} · </text>
      <text>总谱 1 · 分谱 {{ stats.byLevel?.[2]?.total || 0 }} · 支谱 {{ stats.byLevel?.[3]?.total || 0 }}</text>
    </view>

    <view class="tree-list">
      <view v-for="node in branchTree" :key="node.code" class="branch-node" :class="`level-${node.level}`" @tap="toggleDetail(node.code)">
        <view class="node-row">
          <text class="node-indent">{{ '  '.repeat(node.level - 1) }}</text>
          <text class="node-icon">{{ node.level === 1 ? '📖' : node.level === 2 ? '📂' : '📄' }}</text>
          <view class="node-info">
            <text class="node-name">{{ node.name }}</text>
            <text class="node-code">{{ node.code }}</text>
          </view>
          <text class="node-status" :class="node.status.toLowerCase()">{{ node.status }}</text>
          <text class="node-toggle" v-if="node.expanded">▲</text>
          <text class="node-toggle" v-else>▼</text>
        </view>
        <!-- 详情面板 -->
        <view class="detail-panel" v-if="node.expanded && detailMap[node.code]">
          <view class="detail-row"><text class="detail-label">region</text><text>{{ detailMap[node.code].region || '—' }}</text></view>
          <view class="detail-row"><text class="detail-label">人口</text><text>{{ detailMap[node.code].population ?? 0 }}</text></view>
          <view class="detail-row" v-if="detailMap[node.code].generationVerses"><text class="detail-label">字辈</text><text>{{ detailMap[node.code].generationVerses }}</text></view>
          <view class="detail-row"><text class="detail-label">描述</text><text>{{ detailMap[node.code].description || '—' }}</text></view>
          <view class="detail-actions" v-if="canArchive && node.status === 'ACTIVE'">
            <button class="btn-edit" @tap.stop="showEditDialog(node.code)">编辑</button>
            <button class="btn-archive" v-if="node.level > 1" @tap.stop="archiveBranch(node.code)">归档</button>
          </view>
          <view class="detail-children" v-if="detailMap[node.code].children && detailMap[node.code].children.length">
            <text class="sub-title">子分支：</text>
            <view v-for="c in detailMap[node.code].children" :key="c.code" class="child-item" @tap.stop="toggleDetail(c.code)">
              <text class="node-indent"></text>
              <text class="node-icon">{{ c.level === 3 ? '📄' : '📂' }}</text>
              <text class="child-name">{{ c.name }}</text>
              <text class="child-code">{{ c.code }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 创建对话框 -->
    <uni-popup ref="createPopup" type="dialog">
      <view class="dialog">
        <text class="dialog-title">创建分支</text>
        <view class="form-item">
          <text class="form-label">名称</text>
          <input class="form-input" v-model="createForm.name" placeholder="分支名称" />
        </view>
        <view class="form-item">
          <text class="form-label">层级</text>
          <picker :range="levelOptions" @change="onLevelChange">
            <text>{{ createForm.level === 2 ? '分谱（二级）' : '支谱（三级）' }}</text>
          </picker>
        </view>
        <view class="form-item">
          <text class="form-label">父分支</text>
          <picker :range="parentOptions.map(b => b.code + ' ' + b.name)" @change="onParentChange">
            <text>{{ createForm.parentLabel || '选择父分支' }}</text>
          </picker>
        </view>
        <view class="form-item">
          <text class="form-label">地域</text>
          <input class="form-input" v-model="createForm.region" placeholder="省市县" />
        </view>
        <view class="dialog-actions">
          <button class="btn-cancel" @tap="closeCreateDialog">取消</button>
          <button class="btn-primary" @tap="createBranch">确认创建</button>
        </view>
      </view>
    </uni-popup>
    <!-- 编辑对话框 -->
    <uni-popup ref="editPopup" type="dialog">
      <view class="dialog">
        <text class="dialog-title">编辑分支</text>
        <view class="form-item">
          <text class="form-label">描述</text>
          <textarea class="form-textarea" v-model="editForm.description" placeholder="分支描述" />
        </view>
        <view class="form-item">
          <text class="form-label">字辈诗</text>
          <textarea class="form-textarea" v-model="editForm.generationVerses" placeholder="本支字辈诗（≤500）" maxlength="500" />
        </view>
        <view class="form-item">
          <text class="form-label">人口</text>
          <input class="form-input" v-model.number="editForm.population" type="number" placeholder="本支现有人口数" />
        </view>
        <view class="dialog-actions">
          <button class="btn-cancel" @tap="closeEditDialog">取消</button>
          <button class="btn-primary" @tap="saveEdit">保存</button>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { listAll, detail as fetchDetail, create, archive, stats as fetchStats, update } from '@/services/branch';
import { hasRole } from '@/utils/auth';
import { parseBranchCode, branchLevelLabel } from '@/utils/branch-code';

interface BranchItem {
  _id?: string; code: string; name: string; level: number; parentCode?: string | null;
  status: string; region?: string; population?: number; description?: string;
  generationVerses?: string; children?: BranchItem[];
  expanded: boolean;
}

const branchTree = ref<BranchItem[]>([]);
const detailMap = ref<Record<string, any>>({});
const stats = ref<any>(null);
const userRole = ref<string>('VISITOR');
const createPopup = ref<any>(null);
const editPopup = ref<any>(null);
const editForm = ref({ code: '', description: '', generationVerses: '', population: '' });
const editCode = ref<string>('');

// 角色门禁
const canCreate = computed(() => ['BRANCH_HEAD', 'EDITOR', 'HISTORIAN', 'CHIEF'].includes(userRole.value));
const canArchive = computed(() => ['EDITOR', 'HISTORIAN', 'CHIEF'].includes(userRole.value));
const canStats = computed(() => ['EDITOR', 'HISTORIAN', 'CHIEF'].includes(userRole.value));

// 创建表单
const createForm = ref({
  name: '', level: 2, parentCode: '', parentLabel: '', region: ''
});
const levelOptions = ['分谱（二级）', '支谱（三级）'];

function onLevelChange(e: any) {
  createForm.value.level = e.detail.value === 0 ? 2 : 3;
}
const parentOptions = computed(() =>
  branchTree.value.filter(b => b.level < (createForm.value.level === 2 ? 1 : 2))
);
function onParentChange(e: any) {
  const idx = e.detail.value;
  const p = parentOptions.value[idx];
  if (p) {
    createForm.value.parentCode = p.code;
    createForm.value.parentLabel = `${p.code} ${p.name}`;
  }
}

// 构建树：按 code 排序，计算出子节点的展开缩进
function buildTree(items: BranchItem[]) {
  const sorted = items.slice().sort((a, b) => a.code.localeCompare(b.code));
  // 只取顶级（parentCode null 或 HAO-0000 作为总谱根）
  return sorted.filter(n => !n.parentCode || n.parentCode === 'HAO-0000');
}

onMounted(async () => {
  // 尝试获取角色
  try {
    const { data: user } = await (uni as any).cloud.callFunction({ name: 'auth', data: { action: 'me' } });
    userRole.value = user?.role || 'VISITOR';
  } catch {}

  const [listRes, statsRes] = await Promise.all([
    listAll(500),
    canStats.value ? fetchStats() : Promise.resolve(null)
  ]);
  if (listRes?.data?.items) {
    branchTree.value = listRes.data.items.map((i: any) => ({ ...i, expanded: false }));
  }
  if (statsRes?.data) stats.value = statsRes.data;
});

async function toggleDetail(code: string) {
  const node = branchTree.value.find(n => n.code === code);
  if (!node) return;
  node.expanded = !node.expanded;
  if (node.expanded && !detailMap.value[code]) {
    try {
      const res = await fetchDetail(code);
      if (res?.data) detailMap.value[code] = res.data;
    } catch {}
  }
}

function showCreateDialog() {
  createForm.value = { name: '', level: 2, parentCode: '', parentLabel: '', region: '' };
  createPopup.value?.open?.();
}
function closeCreateDialog() {
  createPopup.value?.close?.();
}

async function createBranch() {
  if (!createForm.value.name.trim()) return uni.showToast({ title: '请输入分支名称', icon: 'none' });
  try {
    const res = await create({
      name: createForm.value.name.trim(),
      level: createForm.value.level as 2 | 3,
      parentCode: createForm.value.parentCode || undefined,
      region: createForm.value.region || undefined,
    });
    if (res?.success) {
      uni.showToast({ title: '创建成功', icon: 'success' });
      closeCreateDialog();
      // 刷新列表
      const listRes = await listAll(500);
      if (listRes?.data?.items) branchTree.value = listRes.data.items.map((i: any) => ({ ...i, expanded: false }));
    } else {
      uni.showToast({ title: res?.message || '创建失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '创建失败', icon: 'none' });
  }
}

async function archiveBranch(code: string) {
  uni.showModal({
    title: '归档确认',
    content: `归档后分支将不可用，确认归档 ${code}？`,
    success: async (res: any) => {
      if (!res.confirm) return;
      try {
        const r = await archive(code);
        if (r?.success) {
          uni.showToast({ title: '归档成功', icon: 'success' });
          const node = branchTree.value.find(n => n.code === code);
          if (node) node.status = 'ARCHIVED';
        } else {
          uni.showToast({ title: r?.message || '归档失败', icon: 'none' });
        }
      } catch (e: any) {
        uni.showToast({ title: e.message || '归档失败', icon: 'none' });
      }
    }
  });
}

// 编辑对话框
const canEdit = computed(() => ['EDITOR', 'HISTORIAN', 'CHIEF'].includes(userRole.value));

function showEditDialog(code: string) {
  const detail = detailMap.value[code];
  if (!detail) return uni.showToast({ title: '加载中', icon: 'none' });
  editCode.value = code;
  editForm.value = {
    code,
    description: detail.description || '',
    generationVerses: detail.generationVerses || '',
    population: String(detail.population ?? '')
  };
  editPopup.value?.open?.();
}
function closeEditDialog() {
  editPopup.value?.close?.();
}
async function saveEdit() {
  if (!editForm.value.description?.trim() && !editForm.value.generationVerses?.trim()) {
    return uni.showToast({ title: '请填写描述或字辈诗', icon: 'none' });
  }
  try {
    const payload: any = {};
    if (editForm.value.description.trim()) payload.description = editForm.value.description.trim();
    if (editForm.value.generationVerses.trim()) payload.generationVerses = editForm.value.generationVerses.trim();
    if (editForm.value.population !== '' && editForm.value.population !== null) {
      const pop = parseInt(editForm.value.population, 10);
      if (!isNaN(pop)) payload.population = pop;
    }
    const res = await update(editCode.value, payload);
    if (res?.success) {
      uni.showToast({ title: '保存成功', icon: 'success' });
      // 更新详情缓存
      if (detailMap.value[editCode.value]) {
        detailMap.value[editCode.value] = { ...detailMap.value[editCode.value], ...payload };
      }
      // 同步 stats
      if (canStats.value && stats.value) {
        const [listRes, statsRes] = await Promise.all([
          listAll(500),
          fetchStats()
        ]);
        branchTree.value = listRes.data.items.map((i: any) => ({ ...i, expanded: false }));
        stats.value = statsRes.data;
      }
      closeEditDialog();
    } else {
      uni.showToast({ title: res?.message || '保存失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '保存失败', icon: 'none' });
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: #FAF8F2; padding: 16px; }
.header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.title { font-size: 20px; font-weight: 600; color: #26221E; }
.btn-create { background: #B03A2E; color: #fff; font-size: 14px; padding: 6px 16px; border-radius: 6px; }
.stats-bar { font-size: 12px; color: #8A867F; margin-bottom: 12px; }
.tree-list { background: #fff; border-radius: 8px; overflow: hidden; }
.branch-node { border-bottom: 1px solid #F0EDE6; }
.node-row { display: flex; align-items: center; padding: 12px 16px; cursor: pointer; }
.node-indent { width: 16px; }
.node-info { flex: 1; margin-left: 8px; }
.node-name { font-size: 15px; color: #26221E; font-weight: 500; }
.node-code { font-size: 11px; color: #8A867F; margin-left: 4px; }
.node-status { font-size: 11px; padding: 2px 6px; border-radius: 4px; margin-right: 8px; }
.node-status.active { background: #E8F5E9; color: #2E7D32; }
.node-status.archived { background: #F5F5F5; color: #9E9E9E; }
.node-status.merged { background: #FFF3E0; color: #E65100; }
.node-toggle { font-size: 10px; color: #C0BBAD; }
.detail-panel { background: #F9F7F2; padding: 8px 16px 12px 40px; font-size: 13px; color: #4A4640; }
.detail-row { display: flex; margin-bottom: 4px; }
.detail-label { width: 48px; color: #8A867F; flex-shrink: 0; }
.detail-actions { margin-top: 8px; display: flex; gap: 6px; }
.btn-edit { background: #1976D2; color: #fff; font-size: 12px; padding: 2px 12px; border-radius: 4px; }
.btn-archive { background: #E57373; color: #fff; font-size: 12px; padding: 2px 12px; border-radius: 4px; }
.detail-children { margin-top: 8px; padding-left: 8px; }
.sub-title { font-size: 12px; color: #8A867F; }
.child-item { display: flex; align-items: center; padding: 4px 0; }
.child-name { font-size: 13px; margin-left: 4px; }
.child-code { font-size: 11px; color: #8A867F; margin-left: 4px; }
.dialog { background: #fff; padding: 20px; border-radius: 12px; width: 300px; }
.dialog-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
.form-item { margin-bottom: 12px; }
.form-label { font-size: 13px; color: #8A867F; margin-bottom: 4px; display: block; }
.form-input { border: 1px solid #E0DDD4; border-radius: 6px; padding: 8px 12px; font-size: 14px; }
.dialog-actions { display: flex; justify-content: flex-end; margin-top: 16px; }
.btn-cancel { background: #F0EDE6; color: #26221E; padding: 6px 20px; border-radius: 6px; margin-right: 8px; font-size: 14px; }
.btn-primary { background: #B03A2E; color: #fff; padding: 6px 20px; border-radius: 6px; font-size: 14px; }
.level-1 .node-row { background: #F5EFE6; }
</style>