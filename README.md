# 好诚事家风 · 数字祠堂掌上家园

赵县宋村郝氏家族数字化家谱与文化传承小程序。以「数字祠堂」为核心，提供谱系管理、家族史传承、宗亲互动三大能力，基于 **uni-app + 微信云开发** 构建。

## 功能特性

### 谱系管理（pkg-family）
- 世系树 / 宝塔图双视图，成员档案与关系计算（亲属称谓、方言称谓）
- GEDCOM 5.5.1 / 7.0 导入导出，Excel 批量导入
- 入谱申请双人审核门禁 + 公示期（entry 审核链）
- 字辈预检与世系命名（generation 五 action）

### 家族史与文化（pkg-shrine / pkg-content）
- 「宋村·根脉」板块：地标、大事年表、迁居考（数据源 `utils/cultural-data.ts`，与云端种子逐字同步）
- 家族史考证底稿《宋村郝氏家族史资料》（五级证据标注 + 存疑台账）
- 纪念堂（含遇难同胞纪念）、祠堂文化、新闻动态

### 宗亲互动（pkg-game / pkg-home / pkg-moment）
- 家族游戏：中国象棋（规则引擎 + 残局库）、梨园小筑戏曲票友模拟、异步对局
- 积分体系、记分榜、家族动态、农历日历、天气

### 平台治理
- BranchScope RBAC 分支权限（全局角色 / 房长支长 scope 角色）
- 登录鉴权 + 写操作限流与重放防护（writeGuard）
- 数据备份、行为分析、安全扫描

## 技术栈

uni-app 3（Vue 3.4）· 微信云开发（wx-server-sdk）· Pinia · TypeScript · Vite · Sass · lunar-javascript

## 快速开始

```bash
# 环境要求：Node.js >= 22（棋类引擎为纯 ESM，低版本加载会报错）
npm install

# 微信小程序
npm run dev:mp-weixin      # 开发（微信开发者工具导入 dist/dev/mp-weixin）
npm run build:mp-weixin    # 生产构建

# H5
npm run dev:h5
npm run build:h5
```

> 本仓库为 HBuilderX 平铺布局（`pages/`、`App.vue`、`manifest.json` 位于仓库根）。
> `scripts/uni-run.js` 通过注入 `UNI_INPUT_DIR` 使 CLI 与 HBuilderX 双工作流兼容。

## 测试与质量门禁

```bash
npm test            # 单测（44 个测试文件）
npm run verify      # 完整门禁：check:env → test → lint → check:functions → check:gateway
npm run lineage:verify  # 世系数据校验
```

- `check:env`：环境核查 + 云函数注册一致性（`cloud.config.json` 与磁盘实现须对齐）
- `check:functions`：40 个云函数加载与结构校验
- `check:gateway`：§7.10 云接口不变性校验

## 目录结构

```
├── pages/               # 主包页面（平铺布局）
├── pkg-family/          # 分包：谱系管理
├── pkg-shrine/          # 分包：祠堂 / 纪念 / 根脉文化
├── pkg-game/            # 分包：家族棋局
├── pkg-home|moment|news|profile|calendar|content|growth/
├── components/          # 公共组件
├── services/            # 服务层（TS）
├── stores/              # Pinia 状态
├── utils/               # 工具层（TS，含 cultural-data.ts 数据源）
├── cloud/
│   ├── functions/       # 云函数（40 个，注册表见 cloud.config.json）
│   ├── db-schemas/      # 集合 schema
│   └── common/          # 云函数公共库（sync:common 分发副本，不入库）
├── scripts/             # 构建 / 校验 / 部署脚本
├── tests/               # node:test 单测
└── docs/                # 项目文档
```

## 部署

- 打包与预检：`npm run deploy`（`scripts/prepare-deploy.ps1`，含测试门禁、变更日志、产物清单、权限矩阵）
- 云函数：经微信开发者工具从工作盘上传；`package.json` 与函数内依赖副本不入库
- 详见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## 文档索引

| 文档 | 说明 |
|------|------|
| [docs/宋村郝氏家族史资料.md](docs/宋村郝氏家族史资料.md) | 家族史考证底稿（五级证据标注 + Q1—Q8 存疑台账） |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 部署指南 |
| [docs/API.md](docs/API.md) | 云函数接口说明 |
| [docs/ARCHITECTURE-V2.0-Universal-Branch-Framework.md](docs/ARCHITECTURE-V2.0-Universal-Branch-Framework.md) | V2.0 通用分支框架架构 |
| [docs/普通族人使用指南.md](docs/普通族人使用指南.md) | 族人使用手册 |
| [docs/族史委核心培训手册.md](docs/族史委核心培训手册.md) · [docs/房长支长培训手册.md](docs/房长支长培训手册.md) | 管理员培训材料 |

## 分支说明

- `main`：基线分支
- `dev`：开发主线（当前活跃）

---

© 宋村郝氏家族 · 好诚事家风项目组。本项目为家族内部文化传承用途，未经授权请勿商用。
