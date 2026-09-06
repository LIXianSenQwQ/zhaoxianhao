# Git 分支模型与 PR 合并策略

> 仓库：好诚事家风 家谱系统（monorepo：cloud/ 云函数 + client 分包 + docs/）
> 当前已存在分支：`main`（生产）、`dev`（集成）
> 配套：`.github/workflows/ci.yml`（自动门禁）、`scripts/pr-merge.js`（本地合并助手）

---

## 一、分支拓扑

```
main  ──────────────────────────────────────────────► 生产（只接受 release/* 合并）
   │
   └── dev（集成主干，每日合并点）
         │
         ├── feature/R21-almanac   （功能分支，来自 dev）
         ├── feature/R22-weather
         ├── fix/xxx               （hotfix 分支，来自 dev）
         └── docs/xxx              （文档分支，来自 dev）
```

| 分支 | 生命周期 | 合并方向 | 保护规则 |
|---|---|---|---|
| `main` | 永久 | ← `release/*` | 强制 PR + 2 人审阅 + CI 全绿 + 禁直推 |
| `dev` | 永久 | ← `feature/*`, `fix/*`, `docs/*` | 强制 PR + 1 人审阅 + CI 全绿 |
| `feature/*` | 短命（≤1 周） | → `dev` | 无（但需通过本地 verify） |
| `fix/*` | 短命 | → `dev`（紧急可 → `main`） | 同上 |
| `docs/*` | 短命 | → `dev` | 同上 |
| `release/*` | 发布窗口 | → `main` + 回 `dev` | PR 模式 |

**约定**：直接向 `main` 推送一律禁止；`dev` 不直接推送（用 PR）。

---

## 二、PR 合并策略（Squash · 语义化）

每次 PR 合并到 `dev` / `main` 一律 **Squash Merge**，提交信息遵循：

```
feat(R21): 一句话描述        # 新功能
fix(R21): 一句话描述          # 缺陷修复
docs(...): 一句话描述         # 文档
chore(...): 一句话描述        # 工具/脚本/依赖
refactor(...): 一句话描述     # 重构（行为不变）
test(...): 一句话描述         # 仅测试
perf(...): 一句话描述         # 性能
style(...): 一句话描述        # 格式（不涉及逻辑）
```

其中 `(R21)` 为可选的 Sprint 标签；Sprint 提交沿用历史 `feat(RN)` 格式保持连续。

**合并前置条件（PR 检查单）**
1. 目标分支为最新（先 `git pull origin dev`）
2. `npm run verify` 本地全绿（tests + lint + check:functions + check:env）
3. 无与主干的冲突，或有冲突已解决
4. （dev→main 时）2 人 Code Review

---

## 三、每日工作流（普通开发）

```bash
# 1. 从最新 dev 拉功能分支
git checkout dev && git pull origin dev
git checkout -b feature/R25-compliance

# 2. 开发 + 提交（小步提交，无格式要求）
git add -A
git commit -m "feat(R25): ..."

# 3. 本地门禁
npm run verify

# 4. 推到远端开 PR
git push -u origin feature/R25-compliance
# → 打开 GitHub，New Pull Request：feature/R25-compliance → dev
# → PR 标题即 squash 提交信息：feat(R25): ...

# 5. PR 合并（用辅助脚本做本地校验）
node scripts/pr-merge.js --base dev --head feature/R25-compliance
```

---

## 四、分支清理

- 功能分支合并后即删（远端 + 本地）：
  ```bash
  git push origin --delete feature/R25-compliance
  git branch -d feature/R25-compliance
  ```
- `docs/planning/*` 这类长期规划文件直接合入 dev，不设独立分支（规模小时）。

---

## 五、与既有历史对齐

当前仓库历史（主分支 dev，R19–R26 均直接提交）：
```
dev: 56947ea(R21) → 8fbc46b(R22) → 933d7f2(R23) → 83b718b(R24) → 7f3b734(R25) → 6c21e9f(R26)
main: 与 dev 分离点之前的历史（90e5b86 等）
```

> 若需把 R21–R26 并入 main 形成可发布基线，先建 `release/v2.0.2` 分支：
> `git checkout -b release/v2.0.2 dev` → PR 到 main → 2 人审阅后 squash。

---

## 六、CI 门禁（GitHub Actions · 详见 .github/workflows/ci.yml）

| 事件 | 触发 |
|---|---|
| `pull_request` | 开向 dev/main 的 PR |
| `push` | 推送到 dev/main（含合并后） |
| `workflow_dispatch` | 手动重跑 |

| 步骤 | 内容 |
|---|---|
| 1 | Checkout + Setup Node 18 |
| 2 | `npm ci`（有 lockfile）/ `npm install`（无） |
| 3 | `npm run verify`（测试 + lint + 云函数结构） |
| 4 | 结果状态徽章（需自行配 Badge URL） |

> 注意：本仓库部分云函数依赖 `wx-server-sdk`，CI 内通过 stub 注入跑离线测试，无需真实云环境；`check:env` 只做本机环境探测，CI 上无环境变量时为 warn 不阻断（已在脚本中按需容忍）。

---

## 七、回滚策略

| 场景 | 手段 |
|---|---|
| PR 引入回归 | `git revert <squash-commit>` 于 dev → 走 PR |
| 生产异常 | 版本回退（小程序后台） + 数据库快照恢复 + 功能开关关闭 |
| 合并错误 | 在合并目标分支上 revert，不删历史 |
