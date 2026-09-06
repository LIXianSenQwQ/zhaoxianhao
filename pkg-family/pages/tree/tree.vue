<template>
  <view class="tree-page">
    <!-- 加载骨架 -->
    <Skeleton v-if="store.loadingPaths.size" :rows="3" />

    <!-- 错误兜底 -->
    <ErrorPage
      v-else-if="loadError"
      :message="loadError"
      @retry="loadRoot"
    />

    <template v-else>
      <scroll-view
        class="tree-scroll"
        scroll-y
        :enable-back-to-top="true"
        @scrolltolower="handleLoadMore"
      >
        <!-- 根节点列表 -->
        <view v-for="node in nodes" :key="node.path" class="tree-node">
          <BaseCard @click="toggleCollapseNode(node)">
            <view class="row">
              <image class="avatar" :src="node.gender==='FEMALE' ? '/static/female.png' : '/static/male.png'" mode="aspectFit" />
              <view class="info">
                <text class="name">{{ node.genealogyName || node.name }}</text>
                <text class="meta">{{ getKinshipTitle(node) }} · {{ node.generation }}世</text>
              </view>
              <text class="arrow">{{ isExpanded(node.path) ? '▼' : '▶' }}</text>
            </view>
          </BaseCard>

          <!-- 子树懒加载 -->
          <template v-if="isExpanded(node.path)">
            <view v-if="childrenLoading === node.path" class="loading-line">加载中...</view>
            <template v-else-if="childrenData?.nodes?.length">
              <view v-for="child in childrenData.nodes" :key="child.path" class="sub-node">
                <BaseCard hover-class="card-hover" @click="goDetail(child._id ?? '')">
                  <view class="row">
                    <image class="avatar-s" :src="child.gender==='FEMALE' ? '/static/female.png' : '/static/male.png'" mode="aspectFit" />
                    <view class="info">
                      <text class="name-s">{{ child.genealogyName || child.name }}</text>
                      <text class="meta-s">{{ child.generation }}世</text>
                    </view>
                  </view>
                </BaseCard>
                <view class="sub-sub" v-if="child.children">
                  <!-- 递归渲染三代以内 -->
                  <view v-for="grand in child.children" :key="grand.path" class="tree-node-grand">
                    <BaseCard hover-class="card-hover" @click="goDetail(grand._id ?? '')">
                      <view class="row row-sm">
                        <view class="info info-sm">
                          <text class="name-s">{{ grand.genealogyName || grand.name }}</text>
                          <text class="meta-s">{{ grand.generation }}世</text>
                        </view>
                      </view>
                    </BaseCard>
                  </view>
                </view>
              </view>
            </template>
            <EmptyState v-else-if="!childrenData?.nodes" desc="暂无后代" />
          </template>
        </view>

        <!-- 加载更多指示 -->
        <View v-if="hasMore && loadingNext" class="more-line">加载中...</View>
        <View v-else-if="!hasMore" class="end-line">没有更多了</View>
      </scroll-view>

      <!-- 工具栏：刷新 / 年长模式 / 导出（Sprint R5） -->
      <View class="toolbar">
        <Button class="tool-btn" type="default" @tap="refreshRoot">刷新树视图</Button>
        <template v-if="user.isChief">
          <Button class="tool-btn export-btn" type="primary" @tap="exportCsv">导出 CSV</Button>
        </template>
      </View>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTreeStore } from '@/stores/tree-store';
import { useUserStore } from '@/stores/user';
import BaseCard from '@/components/common/BaseCard.vue';
import Skeleton from '@/components/common/Skeleton.vue';
import ErrorPage from '@/components/common/ErrorPage.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Button from '@/uni_modules/uview-ui/components/u-button/u-button.vue';

const store = useTreeStore();
const user = useUserStore();
const loadError = ref('');
const childrenLoading = ref('');
const childrenData = ref<any | null>(null);
const hasMore = ref(false);
const loadingNext = ref(false);

// 当前根节点路径（始祖）
const ROOT = '/001/'; // 待 API 返回实际根
const nodes = computed(() => (store.getPage(ROOT) as any)?.nodes ?? []);

async function loadRoot() {
  loadError.value = '';
  const paged = await store.loadRoot(ROOT);
  if (!paged) loadError.value = '获取失败';
}

function toggleCollapseNode(node: any) {
  store.toggleCollapse(node.path);
  if (store.isExpanded(node.path)) {
    // 点击展开时触发懒加载
    loadChildrenNode(node);
  } else {
    childrenData.value = null;
  }
}

async function loadChildrenNode(parent: any) {
  if (childrenLoading.value !== parent.path) {
    childrenLoading.value = parent.path;
    try {
      const res = await store.loadChildren(parent.path);
      childrenData.value = res || null;
    } finally {
      childrenLoading.value = '';
    }
  }
}

async function handleLoadMore() {
  if (loadingNext.value || !hasMore.value) return;
  loadingNext.value = true;
  try {
    const nxt = await store.nextPage(ROOT);
    if (nxt) hasMore.value = nxt.hasMore ?? false;
  } finally {
    loadingNext.value = false;
  }
}

function refreshRoot() {
  store.refreshRoot(ROOT);
  loadRoot();
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pkg-family/pages/memberDetail/detail?id=${id}` });
}

/** 批量导出（Sprint R5+R8：先试文件下载，失败自动降级剪贴板） */
async function exportCsv() {
  try {
    const res = await read('member', { action: 'exportFile' }, null, 10000);
    if (res.data?.fileURL) {
      // 直接复制文件 URL
      uni.setClipboardData({
        data: res.data.fileURL,
        success: () => uni.showToast({ title: `已复制下载链接`, icon: 'none' })
      });
    } else if (res.data?.fallback && res.data?.csv) {
      // 降级模式：云存储上传失败，返回 CSV 走剪贴板（R8 降级策略）
      uni.setClipboardData({
        data: res.data.csv,
        success: () => uni.showToast({ title: `已降级复制 ${res.data.total} 条到剪贴板`, icon: 'none' })
      });
    } else if (res.data?.csv) {
      // 兼容旧 API export 直接返回 csv（不降级）
      uni.setClipboardData({
        data: res.data.csv,
        success: () => uni.showToast({ title: `已复制 ${res.data.total} 条到剪贴板`, icon: 'none' })
      });
    } else {
      uni.showToast({ title: res.error?.message || '导出失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '导出失败', icon: 'none' });
  }
}

function getKinshipTitle(n: any): string {
  // TODO: 调用 kindship.relationSteps + kinshipTitle(用户视角)
  return '亲属';
}

onMounted(loadRoot);
</script>

<style scoped>
.tree-page { flex: 1; height: 100%; display: flex; flex-direction: column; }
.tree-scroll { flex: 1; padding-bottom: 60px; }

.tree-node { margin: 12px 0; }
.sub-node { margin-left: 16px; margin-top: 8px; }
.sub-sub { margin-left: 16px; margin-top: 4px; }
.tree-node-grand { margin-top: 4px; }

.row { display: flex; align-items: center; gap: 10px; }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: #EEE7DA; }
.info { flex: 1; }
.name { font-size: 15px; font-weight: 600; color: #2B2320; display: block; }
.meta { font-size: 12px; color: #8A8378; margin-top: 2px; display: block; }
.arrow { font-size: 12px; color: #C9C2B4; }

.name-s { font-size: 14px; font-weight: 500; }
.meta-s { font-size: 11px; color: #8A8378; }

.loading-line, .more-line, .end-line { text-align: center; padding: 12px; font-size: 12px; color: #999; }
.toolbar { position: fixed; bottom: 0; left: 0; right: 0; background: #FFF; border-top: 1px solid #EEE7DA; padding: 12px; display: flex; gap: 12px; justify-content: center; }
.tool-btn { min-width: 120px; }
</style>
