# 「好诚事家风」郝氏家谱系统 · 宋村专属 UI 原型设计

> **版本**: V1.0 (高保真原型)  
> **设计原则**: 文化厚重感 + 易用性优先  
> **响应式**: 移动端优先（小程序/H5）→ PC 端增强  

---

## 一、页面结构总览

```
┌─────────────────────────────────────────────────────┐
│  Header: Logo | 搜索框 [寻根问祖] | 个人中心 ▼       │
├─────────────────────────────────────────────────────┤
│  Navigation Tabs:                                  │
│  【宋村·根脉】|【谱系树】|【同宗查询】|【统计图表】   │
├─────────────────────────────────────────────────────┤
│  Main Content Area (Tab-Specific):                 │
│                                                     │
│  Tab 1: 宋村·根脉（首页核心叙事区）                  │
│  ┌───────────────────────────────────────────────┐ │
│  │ ① 千年宋村——地标轮播卡片                      │ │
│  ├───────────────────────────────────────────────┤ │
│  │ ② 郝氏迁居——时间轴可视化                      │ │
│  ├───────────────────────────────────────────────┤ │
│  │ ③ 家族荣光——郝光甲武状元                      │ │
│  ├───────────────────────────────────────────────┤ │
│  │ ④ 烽火记忆——宋村惨案庄重纪念                   │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  Quick Actions:                                    │
│  [提交入谱申请] [上传碑刻照片] [查看谱书预览]      │
└─────────────────────────────────────────────────────┘
```

---

## 二、宋村·根脉主页设计

### 2.1 顶部导航栏（Header）

**组件规格**：高度 60px，背景色 `#F5E6D3`（米黄仿古纸）

| 元素 | 位置 | 交互说明 |
|------|------|---------|
| **Logo** | 左 | SVG 图标（郝氏堂号"渤海"字样） |
| **搜索框** | 中 | 宽 400px，占位符"输入姓名/字辈/地点..."<br>点击展开下拉筛选器 |
| **寻根问祖按钮** | 右（紧邻搜索） | Primary Button `#8B4513` 深棕色<br>跳转 rootseek.searchKin |
| **个人中心** | 最右 | Avatar + 角色标签显示<br>Dropdown: 资料编辑/退出登录 |

**动效要求**:
- 搜索框输入时自动 expand（200ms ease-out）
- 下拉筛选器支持焦点 trap（可访问性）

---

### 2.2「千年宋村」地标轮播区

**容器**: Card 组件，圆角 12px，阴影 depth=2

#### 轮播卡片结构

```vue
<!-- 单张地标卡片 -->
<view class="landmark-card">
  <image 
    :src="item.imageUrl" 
    mode="aspectFill" 
    class="card-image"
    lazy-load
  />
  <view class="card-overlay">
    <text class="card-title">{{ item.name }}</text>
    <text class="card-desc">{{ item.description }}</text>
    <button class="detail-btn" @click="goToDetail(item)">查看详情</button>
  </view>
</view>
```

#### 内容数据规范

| 字段 | 类型 | 示例 | 来源 |
|------|------|------|------|
| name | string | "西林寺遗址" | docs/locations.md |
| imageUrl | url | cloud-storage/path | 志愿者上传 |
| description | string | "清光绪《赵州志》载：'有岗高耸而上平'" | 族史委校注 |
| coordinates | GeoJSON | {"lat": 37.xxxx, "lng": 114.xxxx} | 地图 API |

**轮播配置**:
- 自动播放间隔：5s
- 手动切换：左右 swipe 手势
- 指示器：dot style（当前页高亮）
- 过渡动画：fade-in+slide-up（200ms）

---

### 2.3「郝氏迁居」时间轴可视化

**布局**: Vertical Timeline（左侧时间线 + 右侧事件节点）

#### 时间线数据结构

```javascript
const migrationTimeline = [
  {
    yearRange: "1537 年前",
    event: "始迁祖迁居宋村",
    evidence: ["地契原件编号 HAO-001", "功德碑拓片"],
    sourceTags: ["赵县档案馆", "碑刻实物"],
    confidence: 5, // ⭐⭐⭐⭐⭐
    icon: "🏡",
    color: "#D2691E" // 巧克力色强调
  },
  {
    yearRange: "1740 年前后",
    event: "分支迁宁晋东汪",
    evidence: ["东汪郝氏谱记载"],
    sourceTags: ["民国版家谱"],
    confidence: 4, // ⭐⭐⭐⭐
    icon: "📜",
    color: "#8B4513"
  },
  {
    yearRange: "1865 年",
    event: "东汪郝氏首修家谱",
    evidence: ["现存初版本"],
    sourceTags: ["实物文献"],
    confidence: 5,
    icon: "📖",
    color: "#A0522D"
  }
];
```

#### 时间轴组件规范

```vue
<template>
  <view class="timeline-container">
    <view v-for="(item, index) in timeline" :key="index" class="timeline-item">
      <!-- 左侧时间线节点 -->
      <view class="timeline-marker" :style="{ backgroundColor: item.color }">
        <text class="marker-icon">{{ item.icon }}</text>
        <view v-if="index !== timeline.length - 1" class="timeline-line"></view>
      </view>
      
      <!-- 右侧内容卡片 -->
      <view class="timeline-content">
        <view class="year-badge">{{ item.yearRange }}</view>
        <view class="event-title">{{ item.event }}</view>
        
        <!-- 证据展示区 -->
        <view class="evidence-section" v-if="item.evidence?.length > 0">
          <text class="evidence-label">💡 依据：</text>
          <view class="evidence-tags" v-for="tag in item.evidence" :key="tag">
            <text class="tag">{{ tag }}</text>
          </view>
        </view>
        
        <!-- 置信度星级 -->
        <view class="confidence-stars">
          <text v-for="i in item.confidence" :key="i">⭐️</text>
        </view>
      </view>
    </view>
  </view>
</template>
```

**交互说明**:
- 点击年份 badge → 展开更多史料详情模态窗
- 滑动时间轴时自动 highlight 当前可见节点
- 支持按世纪筛选（明代/清代/近代）

---

### 2.4「家族荣光」郝光甲专栏

**布局**: Full-width Feature Card（突出展示，无侧边距）

#### 设计规格

| 区块 | 内容 | 样式 |
|------|------|------|
| **主标题** | "道光十八年武状元·郝光甲" | font-size 32px, bold, #8B4513 |
| **引言** | "授头等侍卫，官至广西提督" | italic, #654321, border-left 4px #DAA520 |
| **历史出处** | "据《清史稿·卷四二八》" | small text, gray, align right |
| **生平年表** | 1800-18XX 关键事件时间线 | mini timeline inside card |
| **相关文物** | 官服画像/墓碑照片缩略图 | Grid 2 列布局 |
| **延伸阅读** | 链接到相关研究论文 | Text link style |

**配色方案**:
- 主色：Gold (#DAA520) + Deep Brown (#8B4513)
- 背景：Paper Texture Overlay（纸张纹理滤镜）

#### Vue 模板示例

```vue
<template>
  <view class="hero-card" elevation="3">
    <view class="hero-header">
      <text class="title">道光十八年武状元·郝光甲</text>
      <text class="subtitle">"授头等侍卫，官至广西提督"</text>
    </view>
    
    <scroll-view scroll-x class="gallery">
      <image v-for="photo in heroPhotos" :src="photo.url" mode="aspectFill" />
    </scroll-view>
    
    <view class="info-grid">
      <view class="info-item">
        <text class="label">出生:</text>
        <text class="value">1800 年（嘉庆五年）</text>
      </view>
      <view class="info-item">
        <text class="label">籍贯:</text>
        <text class="value">河北赵县宋村</text>
      </view>
      <view class="info-item">
        <text class="label">逝世:</text>
        <text class="value">待考</text>
      </view>
    </view>
    
    <view class="citation">
      <text class="source">——据《清史稿·卷四二八》</text>
      <button class="btn-detail" @click="showMore()">阅读全文</button>
    </view>
  </view>
</template>
```

---

### 2.5「烽火记忆」宋村惨案纪念区

**设计原则**: 庄重肃穆、素色基调、避免过度装饰

#### 视觉规范

| 元素 | 规格 |
|------|------|
| **背景色** | #E8E8E8（灰白，无花纹） |
| **字体颜色** | #333333（深灰，非纯黑） |
| **边框** | 单线 2px solid #CCCCCC |
| **图片处理** | 黑白滤镜 + opacity 0.8 |
| **音乐** | 可选静音模式（默认关闭音频） |

#### 内容区块

```
┌─────────────────────────────────────────────────┐
│  🕯️ 宋村惨案纪念                               │
├─────────────────────────────────────────────────┤
│  📅 1937 年 10 月 12 日                           │
│  ⚰️ 遇难近 200 人 · 5 户绝户                    │
├─────────────────────────────────────────────────┤
│  [英烈名录] [追思献花] [历史文献]               │
├─────────────────────────────────────────────────┤
│  "慷慨赴国难 热血铸丰碑" ——石家庄日报            │
└─────────────────────────────────────────────────┘
```

**交互功能**:
- 点击 [英烈名录] → Modal 弹窗列出 200 人姓名（分页 50 人/页）
- 点击 [追思献花] → 虚拟献花界面（选择花束→留言→生成纪念卡）
- 点击 [历史文献] → 展示石家庄日报原文扫描件

**情感保护机制**:
- 献花界面提供"静音模式"选项
- 匿名献花可选是否公开姓名
- 所有献花记录定期导出存证（云端冷备）

---

## 三、谱系树视图组件

### 3.1 三大视图模式切换

| 视图 | 适用场景 | 渲染算法 | 性能指标 |
|------|---------|---------|---------|
| **Tree View** | 日常浏览 | 递归深度优先 | 500 节点 <800ms |
| **Fan Tree** | 个人视角辐射 | Canvas 2D 扇形布局 | 300 节点 <500ms |
| **Lineage View** | 直系祖先/后代查询 | 垂直流程图式 | 无限滚动懒加载 |

### 3.2 Tree View 设计规范

```vue
<template>
  <view class="family-tree-container">
    <view class="tree-controls">
      <button @click="switchView('lineage')">直系图</button>
      <button @click="switchView('fan')">扇形图</button>
      <slider :min="1" :max="10" @input="zoomLevelChange" />
    </view>
    
    <canvas id="treeCanvas" canvas-id="treeCanvas" @touchmove="panZoom" />
    
    <view class="node-popup" v-if="hoveredNode">
      {{ hoveredNode.genealogyName }} ({{ hoveredNode.generation }}世)
      <button @click="goToProfile(hoveredNode.id)">详情页</button>
    </view>
  </view>
</template>
```

**交互要点**:
- Pinch to zoom（双指缩放）
- Two-finger drag to pan（双指拖拽平移）
- Tap node → popup 悬浮信息卡
- Long press node → 上下文菜单（分享/导出/编辑权限）

---

## 四、同宗查询入口与搜索结果页

### 4.1 全局搜索框（Header）

**触发条件**: 输入≥2 字符且停留 500ms → 防抖 debounce

#### 下拉筛选器面板

```vue
<view class="search-panel">
  <!-- 关键词输入 -->
  <input type="text" placeholder="输入姓名/字辈/地点..." v-model="keyword" />
  
  <!-- 多维筛选器 -->
  <view class="filter-row">
    <picker :range="generations" value="generation" @change="onGenerationChange">
      <text>{{ selectedGeneration || '任意世代' }}</text>
    </picker>
    <picker :range="regions" value="region" @change="onRegionChange">
      <text>{{ selectedRegion || '任意地域' }}</text>
    </picker>
  </view>
  
  <!-- 实时结果列表 -->
  <scroll-view scroll-y class="results-list">
    <view v-for="hit in hits" class="result-item">
      <text class="name">{{ hit.genealogyName || hit.name }}</text>
      <text class="meta">{{ hit.generation }}世 / {{ hit.branchId }}</text>
    </view>
  </scroll-view>
</view>
```

### 4.2 搜索结果页

**分页策略**: 
- 每页 20 条结果
- 底部无限滚动（infinite scroll）
- 预加载下一页（提前 fetch）

**排序选项**:
- 按世代升序（始祖在前）
- 按相似度（关键词匹配度）
- 按在世状态（ALIVE 优先显示）

---

## 五、统计图表页面

### 5.1 人口总览仪表盘

#### 数据卡片布局（Grid 2x3）

| 卡片 | 指标 | 可视化方式 | 数据来源 |
|------|------|-----------|---------|
| **总人口** | total | Number Flip Animation（数字跳动） | analytics.overview |
| **男女比例** | malePct/femalePct | Donut Chart（环形图） | analytics.overview |
| **在世故世** | alive/deceased | Bar Chart（柱状对比） | analytics.overview |
| **世代数量** | generationCount | Counter Badge | analytics.overview |
| **最大世代** | maxGeneration | Star Icon + 数字 | ancestors 计算 |
| **分支总数** | branchCount | Map Marker 聚合图 | branches 集合 |

### 5.2 世代分布图

**图表类型**: Horizontal Bar Chart（水平条形图）

```vue
<chart-bar 
  :data="generationDist" 
  x-axis="世代编号"
  y-axis="人数"
  color-palette="#8B4513"
  show-axis=true
/>
```

**交互细节**:
- Hover bar → tooltip 显示详细人数
- Click bar → 过滤出该世代所有成员列表
- GenerationChar 标注在 Y 轴刻度旁（如"德 15 人"）

### 5.3 分支对比表

**表格规范**:
- 固定头部（sticky header）
-  sortable columns（点击表头排序）
- export CSV button（右上角）

| 字段 | 说明 | 排序方向 |
|------|------|---------|
| branchName | 分支名称 | 字母序 A-Z |
| total | 总人口数 | 降序 DESC |
| malePct | 男性占比 | 降序 DESC |
| generationDepth | 世代深度 | 升序 ASC |
| populationGrowth | 近 10 年增长率 | 降序 DESC |

---

## 六、提交入谱申请流程页

### 6.1 表单步骤设计（Step Wizard）

**三步完成流程**:

#### Step 1: 基本信息
- 姓名（本名 + 谱名）
- 性别单选按钮（男/女）
- 出生日期（公历/农历切换）
- 父亲/母亲姓名输入

#### Step 2: 证据上传
- 来源类型多选（口述/家谱/档案/实证）
- 文件上传按钮（支持拍照/相册导入）
- 置信度滑块（1-5 星）
- 备注文本域

#### Step 3: 确认提交
- 数据预览卡片（只读）
- 隐私声明 checkbox（必选）
- 提交按钮（Primary Style）
- 提交后进入工单跟踪页

**进度提示**:
- Stepper 组件（1/3 → 2/3 → 3/3）
- 每步保存草稿（自动存储到 sessionStorage）
- 返回上一步保留已填数据

---

## 七、移动端适配规范

### 7.1 响应式断点

| 设备类型 | 宽度范围 | 优化策略 |
|---------|---------|---------|
| **手机 Portrait** | 320-375px | 单列布局，底部 TabBar |
| **手机 Landscape** | 376-568px | 横屏优化，字体放大 |
| **平板** | 569-768px | 双列 Grid，侧边导航 |
| **桌面** | ≥769px | 完整布局，Sidebar 菜单 |

### 7.2 触摸交互优化

- Tap target 最小尺寸 44x44dp（iOS Human Interface）
- Swipe gestures 左滑删除/右滑刷新
- Pull-to-refresh 下拉更新
- Long press 弹出操作菜单

### 7.3 加载状态优化

- Skeleton screens（骨架屏）替代 loading spinner
- Lazy loading 图片占位（blur-up technique）
- Service Worker 缓存静态资源

---

## 附录 A: UI 组件库依赖

| 库名称 | 用途 | 版本 |
|--------|------|------|
| **uni-ui** | uni-app 基础组件 | 1.5.0+ |
| **uCharts** | 图表可视化 | 2.3.0 |
| **wux-weapp** | 微信小程序组件 | 3.0 |
| **Vant Weapp** | 移动端电商级组件 | 4.8 |

---

## 附录 B: 设计交付物清单

- ✅ Figma 源文件（含所有页面 + 组件库）
- ✅ 切图导出（@2x/@3x 多倍图）
- ✅ 字体文件（思源宋体 + 苹方繁简）
- ✅ 动效视频（Lottie JSON 格式）
- ✅ 设计评审记录（族史委反馈汇总）

---

**批准签字**

UI 设计师：_____________    日期：__________  
开发负责人：_____________   日期：__________  
族史委主席：_____________   日期：__________  

---

*本原型经族史委评审通过后冻结版本，后续修改需走变更控制流程。*
