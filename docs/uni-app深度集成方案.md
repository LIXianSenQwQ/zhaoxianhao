# 「好诚事家风」郝氏家谱系统 · uni-app 深度开发集成方案

> **版本**: V1.0  
> **技术栈**: Vue3 + TypeScript + Vite + uni-app  
> **目标平台**: 微信小程序 → App (iOS/Android) → H5  
> **架构模式**: MVVM + Clean Architecture  

---

## 一、项目初始化与基础配置

### 1.1 项目结构规范

```
hao-fengjian/
├── pages/                      # 页面目录（按模块划分）
│   ├── home/                   # 首页（宋村·根脉）
│   ├── tree-view/              # 谱系树可视化
│   ├── search/                 # 同宗查询
│   ├── stats/                  # 统计分析
│   ├── entry-submit/           # 入谱申请流程
│   ├── profile/                # 个人中心
│   └── admin/                  # 管理后台（族史委专用）
├── components/                 # 公共组件库
│   ├── layout/                 # 布局组件（Header/Sidebar/Footer）
│   ├── family-tree/            # 谱系树组件族
│   │   ├── TreeView.vue
│   │   ├── FanTree.vue
│   │   └── LineageView.vue
│   ├── chart/                  # 图表组件族
│   │   ├── PopulationChart.vue
│   │   ├── GenerationDistChart.vue
│   │   └── BranchCompareTable.vue
│   ├── landmark/               # 地标轮播组件
│   │   └── LandmarkCarousel.vue
│   ├── timeline/               # 时间轴组件
│   │   └── MigrationTimeline.vue
│   └── memorial/               # 纪念专区组件
│       └── MemorialArea.vue
├── services/                   # API 服务层
│   ├── request.ts              # HTTP 请求封装
│   ├── rootseek.ts             # 寻根问祖服务
│   ├── analytics.ts            # 统计分析服务
│   ├── member.ts               # 成员管理服务
│   ├── branch.ts               # 分支管理服务
│   ├── generation.ts           # 字辈管理服务
│   └── entry.ts                # 入谱审核服务
├── stores/                     # 状态管理（Pinia）
│   ├── index.ts                # Pinia Store 入口
│   ├── user.ts                 # 用户状态
│   ├── tree.ts                 # 谱系树状态
│   ├── search.ts               # 搜索状态
│   └── admin.ts                # 管理后台状态
├── utils/                      # 工具函数库
│   ├── kinship-title.js        # 称谓计算算法
│   ├── lineage-naming.js       # 字辈匹配算法
│   ├── tree-layout.js          # 树形布局算法
│   ├── fan-tree-layout.js      # 扇形布局算法
│   ├── validation.js           # 表单验证
│   └── date-formatter.js       # 日期格式化
├── types/                      # TypeScript 类型定义
│   ├── member.ts               # Member 实体类型
│   ├── branch.ts               # Branch 实体类型
│   ├── relation.ts             # Relation 关系类型
│   ├── api.ts                  # API 响应类型
│   └── store.ts                # Store 状态类型
├── static/                     # 静态资源
│   ├── images/                 # 图片资源
│   ├── fonts/                  # 字体文件
│   └── icons/                  # SVG 图标集
├── locales/                    # 国际化资源（i18n）
│   ├── zh-CN.json              # 简体中文
│   ├── zh-HK.json              # 繁体中文
│   └── en-US.json              # 英文
├── manifest.json               # 应用配置（标题/图标/权限）
├── pages.json                  # 页面路由配置
├── uni.scss                    # 全局样式变量
└── main.ts                     # 应用入口
```

---

### 1.2 核心配置文件

#### package.json 依赖清单

```json
{
  "name": "hao-fengjian",
  "version": "2.0.0",
  "scripts": {
    "dev:mp-weixin": "vite",
    "build:mp-weixin": "vite build",
    "type-check": "vue-tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest"
  },
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.2.0",
    "pinia": "^2.1.0",
    "uniapp-vue-router": "^2.1.0",
    
    // 图表库
    "uCharts": "^2.3.0",
    
    // UI 组件
    "@dcloudio/uni-ui": "^1.5.0",
    "vant-weapp": "^4.8.0",
    
    // 工具库
    "dayjs": "^1.11.0",
    "lodash-es": "^4.17.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "vue-tsc": "^1.8.0",
    "vitest": "^1.0.0"
  }
}
```

#### tsconfig.json 配置

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "strict": true,
    "jsx": "preserve",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "~/*": ["./*"]
    },
    "types": ["@dcloudio/types"]
  },
  "include": [
    "pages/**/*.ts",
    "pages/**/*.vue",
    "components/**/*.ts",
    "utils/**/*.ts",
    "services/**/*.ts",
    "types/**/*.ts"
  ]
}
```

---

## 二、核心页面实现

### 2.1 首页（宋村·根脉）- `pages/home/index.vue`

```vue
<template>
  <view class="home-container">
    <!-- Header -->
    <Header 
      :title="当前分支名称"
      :hasSearch="true"
      @search="handleSearch"
    />
    
    <!-- Tab Bar -->
    <view class="tab-bar">
      <tab-item 
        v-for="tab in tabs"
        :key="tab.id"
        :active="currentTab === tab.id"
        @click="switchTab(tab.id)"
      >
        {{ tab.name }}
      </tab-item>
    </view>
    
    <!-- Main Content -->
    <scroll-view scroll-y class="main-content">
      <!-- Tab 1: 宋村·根脉叙事区 -->
      <view v-if="currentTab === 'root'" class="section">
        <!-- ① 千年宋村地标轮播 -->
        <LandmarkCarousel :landmarks="landmarks" @itemClick="goToDetail" />
        
        <!-- ② 郝氏迁居时间轴 -->
        <MigrationTimeline 
          :timeline="migrationData"
          :showConfidence="true"
          @yearClick="filterByYear"
        />
        
        <!-- ③ 家族荣光专栏 -->
        <HeroCard 
          v-if="heroData"
          :data="heroData"
          @readMore="showHeroDetails"
        />
        
        <!-- ④ 烽火记忆纪念区 -->
        <MemorialArea 
          :memorialInfo="memorialData"
          @tributeSubmit="submitTribute"
          @silentMode="toggleSilentMode"
        />
      </view>
      
      <!-- 其他 Tab 内容... -->
    </scroll-view>
    
    <!-- Quick Actions 悬浮按钮组 -->
    <view class="quick-actions">
      <button primary @click="goToEntrySubmit">提交入谱申请</button>
      <button secondary @click="uploadDocument">上传碑刻照片</button>
      <button text @click="previewPDF">查看谱书预览</button>
    </view>
    
    <!-- Bottom Nav -->
    <BottomNav 
      :tabs="navTabs"
      @change="onNavChange"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import Header from '@/components/layout/Header.vue'
import LandmarkCarousel from '@/components/landmark/LandmarkCarousel.vue'
import MigrationTimeline from '@/components/timeline/MigrationTimeline.vue'
import HeroCard from '@/components/layout/HeroCard.vue'
import MemorialArea from '@/components/memorial/MemorialArea.vue'
import BottomNav from '@/components/layout/BottomNav.vue'

// Pinia Store
const userStore = useUserStore()

// 本地数据模拟（实际应从 API 获取）
const landmarks = ref([
  { name: '西林寺遗址', description: '有岗高耸而上平', imageUrl: '/static/images/xilin.jpg' },
  { name: '济美桥', description: '元代石拱桥', imageUrl: '/static/images/jimei.jpg' },
  { name: '洨河古道', description: '商周遗址所在地', imageUrl: '/static/images/xiaohe.jpg' }
])

const migrationData = ref([
  { yearRange: '1537 年前', event: '始迁祖迁居宋村', confidence: 5 },
  { yearRange: '1740 年', event: '分支迁宁晋东汪', confidence: 4 }
])

const heroData = ref({
  name: '郝光甲',
  title: '道光十八年武状元',
  photos: []
})

const memorialData = ref({
  date: '1937 年 10 月 12 日',
  victims: '近 200 人',
  casualties: '5 户绝户'
})

// 导航 Tab 管理
const currentTab = ref('root')
const tabs = ref([
  { id: 'root', name: '宋村·根脉' },
  { id: 'tree', name: '谱系树' },
  { id: 'search', name: '同宗查询' },
  { id: 'stats', name: '统计图表' }
])

// 方法定义
const handleSearch = (keyword: string) => {
  console.log('搜索关键词:', keyword)
  // 触发 rootseek.searchKin API
}

const switchTab = (tabId: string) => {
  currentTab.value = tabId
}

const goToEntrySubmit = () => {
  uni.navigateTo({ url: '/pages/entry-submit/index' })
}

const uploadDocument = () => {
  uni.chooseMedia({ count: 10, mediaType: ['image'], success: (res) => {
    // 调用 cloud/storage 上传
  }})
}

const previewPDF = () => {
  uni.showToast({ title: '功能开发中', icon: 'none' })
}

const submitTribute = async (flowerType: string, message: string) => {
  // 调用 memorial tribute API
  console.log('献花:', flowerType, '留言:', message)
}

const toggleSilentMode = (silent: boolean) => {
  console.log('静音模式:', silent)
}

onMounted(() => {
  // 加载首屏数据
  loadLandmarks()
  loadMigrationData()
})
</script>

<style scoped lang="scss">
.home-container {
  min-height: 100vh;
  background-color: #FAF9F6;
}

.tab-bar {
  display: flex;
  background: #F5E6D3;
  padding: 8rpx;
  position: sticky;
  top: 0;
  z-index: 100;
  
  tab-item {
    flex: 1;
    text-align: center;
    padding: 16rpx 0;
    font-size: 28rpx;
    color: #654321;
    
    &.active {
      background: #8B4513;
      color: white;
      border-radius: 8rpx;
    }
  }
}

.main-content {
  padding: 24rpx;
  height: calc(100vh - 200rpx);
}

.quick-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  padding: 16rpx;
  display: flex;
  justify-content: space-around;
  box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.1);
}
</style>
```

---

### 2.2 谱系树视图 - `pages/tree-view/index.vue`

```vue
<template>
  <view class="tree-view-page">
    <!-- Toolbar -->
    <view class="toolbar">
      <button @click="toggleHelp">帮助?</button>
      <picker 
        mode="selector"
        :range="viewModes"
        value="tree"
        @change="switchViewMode"
      >
        <text>{{ viewModes[viewModeIndex] }}</text>
      </picker>
      <slider 
        :min="0.5"
        :max="3"
        :value="zoomLevel"
        @change="handleZoomChange"
      />
    </view>
    
    <!-- Canvas Container -->
    <view class="canvas-wrapper" ref="canvasRef" @touchmove="handlePanZoom">
      <canvas 
        id="familyTreeCanvas"
        canvas-id="familyTreeCanvas"
        :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }"
      />
    </view>
    
    <!-- Node Popup -->
    <view v-if="hoveredNode" class="node-popup">
      <text class="name">{{ hoveredNode.genealogyName }}</text>
      <text class="meta">{{ getRelationTitle(hoveredNode) }}</text>
      <button @click="goToProfile(hoveredNode._id)">查看详情</button>
      <button @click="shareNode(hoveredNode._id)">分享</button>
    </view>
    
    <!-- Loading Skeleton -->
    <view v-if="loading" class="skeleton">
      <view class="sk-node"></view>
      <view class="sk-line"></view>
      <view class="sk-node"></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useTreeStore } from '@/stores/tree'
import { renderTreeView, renderFanTree } from '@/utils/tree-layout'
import { computeLineageLayout } from '@/utils/lineage-view'

const treeStore = useTreeStore()
const canvasRef = ref(null)

// Canvas 渲染相关
const ctx = ref<any>(null)
const canvasWidth = ref(750)
const canvasHeight = ref(1200)
const zoomLevel = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)

// 视图模式
const viewModes = ['树形图', '扇形图', '直系图']
const viewModeIndex = ref(0)
const hoveredNode = ref(null)

// 成员数据加载
const members = ref([])
const loading = ref(true)

// 绘制 Canvas
const drawCanvas = () => {
  if (!ctx.value || members.value.length === 0) return
  
  const mode = viewModeIndex.value === 0 ? 'tree' 
    : viewModeIndex.value === 1 ? 'fan' 
    : 'lineage'
  
  const layout = mode === 'tree' 
    ? renderTreeView(members.value, { padding: 50 })
    : mode === 'fan' 
    ? renderFanTree(members.value, { centerX: 375, centerY: 200 })
    : computeLineageLayout(members.value)
  
  ctx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
  
  // 绘制连接线
  layout.edges.forEach(edge => {
    ctx.value.beginPath()
    ctx.value.moveTo(edge.from.x * zoomLevel.value + offsetX.value, 
                     edge.from.y * zoomLevel.value + offsetY.value)
    ctx.value.lineTo(edge.to.x * zoomLevel.value + offsetX.value, 
                     edge.to.y * zoomLevel.value + offsetY.value)
    ctx.value.stroke()
  })
  
  // 绘制节点
  layout.nodes.forEach(node => {
    ctx.value.beginPath()
    ctx.value.arc(node.x * zoomLevel.value + offsetX.value, 
                 node.y * zoomLevel.value + offsetY.value, 
                 30 * zoomLevel.value, 0, 2 * Math.PI)
    ctx.fillStyle = node.gender === 'MALE' ? '#4A90E2' : '#FF6B9D'
    ctx.fill()
    
    // 文本渲染
    ctx.fillStyle = '#333'
    ctx.textAlign = 'center'
    ctx.fillText(node.genealogyName.slice(0, 3), 
                node.x * zoomLevel.value + offsetX.value,
                node.y * zoomLevel.value + offsetY.value + 5 * zoomLevel.value)
  })
}

// 手势处理
let startX = 0
let startY = 0
let isDragging = false

const handlePanZoom = (e: any) => {
  if (e.touches.length === 2) {
    // 双指缩放
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    )
    zoomLevel.value = Math.max(0.5, Math.min(3, dist / 200))
  } else if (e.touches.length === 1) {
    // 单指拖拽
    if (!isDragging) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      isDragging = true
    } else {
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY
      offsetX.value += dx
      offsetY.value += dy
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      drawCanvas()
    }
  }
}

const handleZoomChange = (e: any) => {
  zoomLevel.value = e.detail.value
  drawCanvas()
}

const switchViewMode = (e: any) => {
  viewModeIndex.value = e.detail.value
  drawCanvas()
}

onMounted(async () => {
  // 初始化 Canvas
  const query = uni.createSelectorQuery().in(this)
  query.select('#familyTreeCanvas').fields({ size: true })
  await query.exec()
  
  // 加载成员数据
  try {
    const res = await treeStore.fetchMembers()
    members.value = res.data
    drawCanvas()
  } catch (err) {
    console.error('加载谱系数据失败:', err)
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  // 清理 Canvas 资源
})
</script>

<style scoped lang="scss">
.tree-view-page {
  min-height: 100vh;
  background: white;
}

.toolbar {
  padding: 16rpx;
  display: flex;
  gap: 16rpx;
  background: #F5E6D3;
}

.canvas-wrapper {
  position: relative;
  width: 100%;
  height: calc(100vh - 120rpx);
}

.node-popup {
  position: absolute;
  top: 100rpx;
  right: 0;
  background: white;
  padding: 24rpx;
  border-radius: 12rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.15);
}
</style>
```

---

### 2.3 同宗查询页 - `pages/search/index.vue`

```vue
<template>
  <view class="search-page">
    <!-- 搜索框 -->
    <view class="search-header">
      <input 
        type="text"
        placeholder="输入姓名/字辈/地点..."
        v-model="keyword"
        confirm-type="search"
        @confirm="handleSearch"
      />
    </view>
    
    <!-- 筛选面板 -->
    <view class="filter-panel" v-if="showFilters">
      <picker 
        mode="selector"
        :range="generationOptions"
        :value="selectedGeneration"
        @change="onGenerationChange"
      >
        <view class="picker-item">
          <text>世代：</text>
          <text>{{ selectedGeneration === -1 ? '任意' : selectedGeneration }}</text>
        </view>
      </picker>
      
      <picker 
        mode="selector"
        :range="regionOptions"
        :value="selectedRegion"
        @change="onRegionChange"
      >
        <view class="picker-item">
          <text>地域：</text>
          <text>{{ regionOptions[selectedRegion] || '全部区域' }}</text>
        </view>
      </picker>
    </view>
    
    <!-- 结果列表 -->
    <scroll-view scroll-y class="results-list">
      <view 
        v-for="hit in hits"
        :key="hit.id"
        class="result-item"
        @click="goToProfile(hit.id)"
      >
        <view class="avatar">
          <text>{{ getInitials(hit.genealogyName || hit.name) }}</text>
        </view>
        <view class="info">
          <text class="name">{{ hit.genealogyName || hit.name }}</text>
          <view class="tags">
            <tag v-if="hit.generation">第{{ hit.generation }}世</tag>
            <tag v-if="hit.branchId">{{ hit.branchId }}</tag>
            <tag v-if="hit.status === 'ALIVE'" color="#52C41A">在世</tag>
          </view>
        </view>
        <view class="match-score">
          <text>匹配度：{{ hit.score || 100 }}%</text>
        </view>
      </view>
      
      <!-- 空状态 -->
      <empty-state v-if="hits.length === 0 && !loading" />
      
      <!-- 加载更多 -->
      <view v-if="hasMore && loading" class="loading-more">
        <text>加载中...</text>
      </view>
    </scroll-view>
    
    <!-- 分页控制 -->
    <view class="pagination">
      <button 
        :disabled="page <= 1"
        @click="prevPage"
      >上一页</button>
      <text>{{ page }}/{{ totalPages }}</text>
      <button 
        :disabled="!hasMore"
        @click="nextPage"
      >下一页</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, debounce } from 'vue'
import { searchKin } from '@/services/rootseek'
import type { KinHit } from '@/types/member'

const keyword = ref('')
const showFilters = ref(false)
const selectedGeneration = ref(-1)
const selectedRegion = ref(0)
const hits = ref<KinHit[]>([])
const loading = ref(false)
const page = ref(1)
const hasMore = ref(false)
const totalPages = ref(0)

const generationOptions = ['-1', '1', '2', '3', '4', '5', '6', '7', '8']
const regionOptions = ['赵县', '宁晋', '邢台', '石家庄', '其他']

// 防抖搜索
const debouncedSearch = debounce((k: string) => {
  performSearch(k)
}, 500)

const handleSearch = () => {
  if (keyword.value.trim()) {
    debouncedSearch(keyword.value.trim())
  }
}

const performSearch = async (keyword: string) => {
  loading.value = true
  try {
    const res = await searchKin({
      keyword,
      generation: selectedGeneration.value === -1 ? undefined : selectedGeneration.value,
      region: selectedRegion.value === 0 ? undefined : regionOptions[selectedRegion.value],
      limit: 20
    })
    hits.value = res.data.hits
    page.value = res.data.page
    hasMore.value = res.data.hasMore
    totalPages.value = Math.ceil(res.data.total / 20)
  } catch (err) {
    console.error('搜索失败:', err)
    uni.showToast({ title: '搜索失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

const nextFilterChange = (val: number) => {
  selectedGeneration.value = val
  page.value = 1
  if (keyword.value.trim()) {
    performSearch(keyword.value.trim())
  }
}

const nextPage = () => {
  if (page.value < totalPages.value) {
    page.value++
    // 实现分页逻辑...
  }
}

const prevPage = () => {
  if (page.value > 1) {
    page.value--
  }
}

const goToProfile = (memberId: string) => {
  uni.navigateTo({ url: `/pages/profile/index?id=${memberId}` })
}
</script>
```

---

## 三、状态管理（Pinia Stores）

### 3.1 User Store - `stores/user.ts`

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo, UserRole } from '@/types/user'

interface AuthState {
  openid: string | null
  role: UserRole
  userInfo: UserInfo | null
  isAuthenticated: boolean
}

export const useUserStore = defineStore('user', () => {
  // State
  const openid = ref<string | null>(null)
  const role = ref<UserRole>('VISITOR')
  const userInfo = ref<UserInfo | null>(null)
  const isAuthenticated = ref(false)

  // Getters
  const isAdmin = computed(() => 
    ['HISTORIAN', 'CHIEF'].includes(role.value)
  )
  
  const canEditBranch = computed(() =>
    ['BRANCH_HEAD', 'HOUSE_HEAD', 'HISTORIAN', 'CHIEF'].includes(role.value)
  )
  
  const canAudit = computed(() =>
    ['BRANCH_HEAD', 'HOUSE_HEAD', 'HISTORIAN', 'CHIEF'].includes(role.value)
  )

  // Actions
  const login = async (wxContext: any) => {
    const res = await wx.getUserProfile({ lang: 'zh_CN' })
    const profile = res.userInfo
    
    const authRes = await wx.cloud.callFunction({
      name: 'auth',
      data: { action: 'login', profile }
    })
    
    if (authRes.result.success) {
      openid.value = authRes.result.openid
      role.value = authRes.result.role as UserRole
      userInfo.value = {
        name: profile.nickName,
        avatar: profile.avatarUrl
      }
      isAuthenticated.value = true
      
      // 持久化存储
      uni.setStorageSync('user_token', authRes.result.token)
    }
  }

  const fetchUserInfo = async () => {
    const res = await wx.cloud.callFunction({
      name: 'profile',
      data: { action: 'getInfo' }
    })
    
    if (res.result.success) {
      userInfo.value = res.result.data
    }
  }

  const logout = () => {
    openid.value = null
    role.value = 'VISITOR'
    userInfo.value = null
    isAuthenticated.value = false
    uni.removeStorageSync('user_token')
  }

  return {
    // State
    openid, role, userInfo, isAuthenticated,
    // Getters
    isAdmin, canEditBranch, canAudit,
    // Actions
    login, fetchUserInfo, logout
  }
})
```

### 3.2 Tree Store - `stores/tree.ts`

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchMembers, fetchRelationGraph } from '@/services/member'

export const useTreeStore = defineStore('tree', () => {
  const allMembers = ref([])
  const activeBranchId = ref('HAO-冀 - 赵县 - 宋村 -001')
  const currentFocusMember = ref<string | null>(null)
  const viewMode = ref<'tree' | 'fan' | 'lineage'>('tree')

  const fetchMembers = async (branchId?: string) => {
    try {
      const res = await fetchMembers({
        branchId: branchId || activeBranchId.value,
        limit: 2000
      })
      allMembers.value = res.data
      return res
    } catch (err) {
      console.error('Fetch members error:', err)
      throw err
    }
  }

  const updateFocusMember = (memberId: string) => {
    currentFocusMember.value = memberId
    // 重新计算树布局
  }

  const setViewMode = (mode: 'tree' | 'fan' | 'lineage') => {
    viewMode.value = mode
  }

  return {
    allMembers,
    activeBranchId,
    currentFocusMember,
    viewMode,
    fetchMembers,
    updateFocusMember,
    setViewMode
  }
})
```

---

## 四、核心工具函数

### 4.1 称谓计算算法 - `utils/kinship-title.js`

```javascript
/**
 * 计算两人之间的正式称谓
 * @param {object} personA - 第一个人的基本信息
 * @param {object} personB - 第二个人的基本信息
 * @returns {string} 称谓结果（如「堂兄」「三叔」）
 */
export function computeKinshipTitle(personA, personB) {
  // 步骤 1: BFS 路径查找
  const path = findBFSPath(personA.id, personB.id)
  if (!path) return '无直接亲属关系'
  
  // 步骤 2: 路径分析
  const analysis = analyzePath(path)
  
  // 步骤 3: 称谓映射表查询
  const titleMap = getKinshipMapping(analysis)
  
  return titleMap
}

/**
 * BFS 最短路径查找（图数据库查询）
 */
function findBFSPath(fromId, toId) {
  // TODO: 使用图数据库 API 查询
  const relations = fetchAllRelations()
  const graph = buildGraph(relations)
  
  const queue = [{ nodeId: fromId, path: [fromId] }]
  const visited = new Set([fromId])
  
  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()
    
    if (nodeId === toId) return path
    
    for (const neighbor of graph[nodeId]) {
      if (!visited.has(neighbor.id)) {
        visited.add(neighbor.id)
        queue.push({ nodeId: neighbor.id, path: [...path, neighbor.id] })
      }
    }
  }
  
  return null
}

/**
 * 路径分析报告
 */
function analyzePath(path) {
  const segments = []
  
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i]
    const to = path[i + 1]
    const relation = findRelation(from, to)
    
    segments.push({
      direction: relation.direction, // PARENT/CHILD/SPOUSE/SIBLING
      degree: relation.degree,      // 亲等（一代/二代/三代）
      subType: relation.subType     // 直系/旁系/姻亲
    })
  }
  
  return { segments, totalGenerations: calculateGenDiff(path) }
}

/**
 * 称谓映射表（简化版）
 */
function getKinshipMapping(analysis) {
  const { segments, totalGenerations } = analysis
  
  // 规则示例
  if (segments.length === 1 && segments[0].direction === 'PARENT') {
    const genDiff = totalGenerations
    const genderMap = { father: '父亲', mother: '母亲' }
    return genderMap
  }
  
  // 旁系称谓（堂兄弟/表兄弟）
  if (segments.some(s => s.direction === 'SIBLING')) {
    const siblingGen = segments.findIndex(s => s.direction === 'SIBLING')
    const diffFromSibling = totalGenerations - siblingGen
    const side = segments[siblingGen - 1].subType === 'PATERNAL' ? '堂' : '表'
    return `${side}${diffFromSibling}代${'兄弟/姐妹'}`
  }
  
  return '待查'
}
```

### 4.2 字辈匹配算法 - `utils/lineage-naming.js`

```javascript
/**
 * 根据出生年份匹配字辈
 * @param {number} birthYear - 公历出生年份
 * @param {string[]} generationPoem - 字辈诗数组
 * @param {number} foundingYear - 始迁年代
 * @returns {object} { generation, generationChar, fullGenealogyName }
 */
export function matchGenerationByYear(birthYear, generationPoem, foundingYear) {
  // 假设每代间隔 25 年
  const avgGenInterval = 25
  
  // 计算世代数（从始祖起算）
  const generationsSinceFounding = Math.floor(
    (birthYear - foundingYear) / avgGenInterval
  )
  
  const generation = generationsSinceFounding + 1
  
  // 模运算循环字辈诗（≤50 代限制）
  const poemLength = generationPoem.length
  const poeticIndex = ((generation - 1) % poemLength) + 1
  const generationChar = generationPoem[poeticIndex - 1]
  
  return {
    generation,
    generationChar,
    fullGenerationChar: generationChar
  }
}

/**
 * 验证谱名合法性
 */
export function validateGenealogyName(name, generationPoem) {
  const errors = []
  
  // 检查是否包含字辈字
  const hasGenerationChar = generationPoem.some(char => 
    name.includes(char)
  )
  
  if (!hasGenerationChar) {
    errors.push('谱名必须包含字辈字')
  }
  
  // 检查长度（2-4 字）
  if (name.length < 2 || name.length > 4) {
    errors.push('谱名长度应为 2-4 个汉字')
  }
  
  // 检查重复
  // ...
  
  return {
    isValid: errors.length === 0,
    errors
  }
}
```

---

## 五、构建优化策略

### 5.1 分包加载

```json
// pages.json 分包配置
{
  "plugins": {},
  "navigationStyle": "custom",
  "tabBar": {
    "list": [
      {
        "pagePath": "pages/home/index",
        "text": "宋村·根脉",
        "iconPath": "/static/icons/home.png",
        "selectedIconPath": "/static/icons/home-active.png"
      },
      {
        "pagePath": "pages/tree-view/index",
        "text": "谱系树",
        "iconPath": "/static/icons/tree.png",
        "selectedIconPath": "/static/icons/tree-active.png"
      }
    ]
  },
  "easycom": {
    "autoscan": true,
    "custom": {
      "^uni-(.*)": "@dcloudio/uni-ui/lib/uni-$1/uni-$1.vue"
    }
  },
  "subPackages": [
    {
      "root": "pages/admin",
      "name": "admin",
      "pages": [
        {
          "path": "index",
          "style": "fullscreen"
        }
      ]
    },
    {
      "root": "pages/stats",
      "name": "stats",
      "pages": [...]
    }
  ]
}
```

### 5.2 性能优化清单

| 优化项 | 目标值 | 实现方式 |
|--------|--------|---------|
| 首屏加载时间 | ≤1.5s | 骨架屏 + 懒加载 + 资源压缩 |
| 包体积 | ≤2MB | 分包加载 + 按需引入 + Tree Shaking |
| 帧率稳定 | ≥50fps | Canvas 2D 渲染 + GPU 加速 |
| 内存占用 | ≤200MB | 虚拟列表 + 图片压缩 + GC 优化 |

---

## 六、部署与发布流程

### 6.1 开发环境启动

```bash
# 安装依赖
pnpm install

# 运行开发服务器（微信小程序）
pnpm dev:mp-weixin

# 运行调试模式
pnpm run dev:mp-weixin --watch
```

### 6.2 生产构建

```bash
# 编译生成
pnpm build:mp-weixin

# 检查类型错误
pnpm type-check

# 代码质量检查
pnpm lint

# 运行测试
pnpm test
```

### 6.3 微信开发者工具上传

1. 登录微信公众平台 https://mp.weixin.qq.com
2. 进入"开发管理" → "版本管理"
3. 上传新版本（选择 `dist/mp-weixin` 目录）
4. 填写版本号 + 更新日志
5. 提交审核（族史委验收通过后）

---

**附录：API 接口速查表**

| 端点 | 云函数 | 说明 |
|------|--------|------|
| `/api/member/search` | member/index.js | 成员搜索 |
| `/api/rootseek/kindred` | rootseek/index.js | 同宗查询 |
| `/api/analytics/overview` | analytics/index.js | 人口总览 |
| `/api/entry/submit` | entry/index.js | 入谱申请提交 |

---

*本方案经开发团队评审通过，后续修改需走变更控制流程。*
