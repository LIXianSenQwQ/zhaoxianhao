# Store API 使用示例（好诚事家风 · Sprint R7）

> 本文档提供 `stores/user.ts` / `stores/tree-store.ts` 的使用示例和接口说明。

---

## 1. userStore（用户上下文）

### 入口

```ts
import { useUserStore } from '@/stores/user';
const user = useUserStore();
```

### 核心状态

- `isLoggedIn`: boolean — 是否已登录（OPENID 存在）
- `userInfo`: object | null — `{ openid, role, branchId }`
- `isMember`: computed — `role ∈ ['MEMBER','EDITOR','CHIEF']`
- `isAdmin`: computed — `role === 'EDITOR' || role === 'CHIEF'`
- `isChief`: computed — `role === 'CHIEF'`

### 典型用法

```vue
<script setup lang="ts">
import { useUserStore } from '@/stores/user';

const user = useUserStore();

// 条件渲染（仅会员可见）
if (!user.isMember) {
  // 跳转登录
  uni.redirectTo({ url: '/pages/login/login' });
}

// 权限按钮
<Button v-if="user.isChief" @click="exportMembers">导出 CSV</Button>
</script>
```

---

## 2. treeStore（族谱树视图）

### 入口

```ts
import { useTreeStore } from '@/stores/tree-store';

const { 
  isExpanded, toggleCollapse, setCollapse,
  getPage, hasCache, loadRoot, loadChildren, nextPage, refreshRoot, reset 
} = useTreeStore();
```

### 状态机与缓存

- `collapsedMap`: Record<path, true/false> — 折叠态（不可变更新）
- `pages`: Map<key, TreePage> — 页缓存（根页、子树页、分页页）
- `loadingPaths`: Set<key> — 加载中键，防并发

### 生命周期方法

#### loadRoot(rootPath: string)

加载根节点列表（如 `/001/`），写入缓存 `tree:{path}:r`。

```js
const root = await loadRoot('/001/');
if (root) renderNodes(root.nodes);
```

#### loadChildren(parentPath: string)

点击展开时懒加载子树（独立缓存 `tree:{path}:c`）。

```js
const sub = await loadChildren('/001/003/');
renderSub(sub?.nodes ?? []);
```

#### nextPage(rootPath: string, pageNo: number)

若当前页有 `hasMore=true`，续载下一页；失败返回 null。

```js
const more = await nextPage('/001/', 2);
appendNodes(more?.nodes ?? []);
```

#### refreshRoot(rootPath: string)

清除本根前缀所有缓存并重新拉取。

```js
await refreshRoot('/001/'); // 刷新后 root 自动更新
```

#### isExpanded(path: string)

判断节点是否展开（默认展开）。

```js
if (isExpanded('/001/')) showExpandIcon(); else showCollapseIcon();
```

### 错误处理

- 网络失败不会写入缓存（下次重试）
- 请求超时按 `request.ts` 预算重试

```js
try {
  const nodes = await loadChildren('/x/');
  if (!nodes) console.warn('懒加载失败，将重试');
} catch (e) {}
```

---

## 3. 组合模式（detail 页授权卡）

```vue
<script setup lang="ts">
import { useUserStore } from '@/stores/user';
import { useTreeStore } from '@/stores/tree-store';

const user = useUserStore();
const { isExpanded } = useTreeStore();
</script>
```

- `isChief` 显示导出按钮
- `!isMember` 禁用搜索框

---

## 备注

- tree-store 依赖注入式测试方案见 `utils/tree-flow.js`（R6/R7 编排层）
- user-store 无需测试（纯 getter/state，逻辑已在 smoke test 中门禁验证）
