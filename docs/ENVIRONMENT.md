# 「好诚事家风」开发环境搭建文档

> 版本：v1.1 ｜ 更新：2026-09-06 ｜ 适用：uni-app（Vue 3 + Vite 5）CLI 工作流
>
> 本文档基于 2026-09-06 的全量环境排查与双端构建实测（H5 + 微信小程序），
> 所有命令与 FAQ 均经过实际验证。

---

## 1. 前置要求

| 组件 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 18（实测 24.9.0 通过） | 含 npm |
| npm | ≥ 9 | |
| 微信开发者工具 | 最新稳定版 | 仅小程序端联调需要；导入项目目录 = 仓库根 |
| HBuilderX（可选） | 4.29+ | 与 CLI 工作流互不干扰，见 §7 |

**本仓库特殊点（务必先读）**：本工程是 **HBuilderX 平铺布局**——`pages/`、`App.vue`、
`manifest.json`、`pages.json` 位于**仓库根**而非 `src/`。uni CLI 默认要求 `src/` 布局，
因此所有命令统一经 `scripts/uni-run.js` 启动（内部注入 `UNI_INPUT_DIR=仓库根`），
**不要**直接执行 `npx uni ...`。

## 2. 安装步骤

```bash
# 1) 安装依赖（首次 / 拉取代码后）
npm install

# 2) 环境自检（Node/npm/关键依赖/环境变量/布局 一次性体检）
npm run env:check

# 3) 云函数依赖（需要上传云函数时）
npm run sync-common   # 同步 cloud/functions/common 到各云函数
cd cloud/functions/login && npm install   # 按需逐个安装
```

## 3. 环境变量

- 配置样例见 `.env.example`（复制为 `.env.local` 后填写，**不入库**）。
- 当前唯一业务变量：`VITE_CLOUD_ENV_ID`（微信云开发环境 ID，见 `utils/cloud-env.ts`）。
- 优先级：`.env` 配置 > `uni.setStorageSync('cloudEnvId', ...)` 运行时覆盖（联调切换用）> 占位符 `YOUR_CLOUD_ENV_ID`。

## 4. 常用命令（全部经 uni-run 封装）

| 命令 | 作用 | 产物/地址 |
| --- | --- | --- |
| `npm run dev:h5` | H5 开发服务器 | http://localhost:5173（局域网可访问） |
| `npm run build:h5` | H5 生产构建 | `dist/build/h5/`（约 111 文件） |
| `npm run dev:mp-wechat` | 微信小程序开发构建（watch） | `unpackage/dist/dev/mp-weixin/` |
| `npm run build:mp-wechat` | 微信小程序生产构建 | `unpackage/dist/build/mp-weixin/`（约 105 文件） |
| `npm run env:check` | 环境自检 | 终端报告 |
| `npm run lint` | 代码静态检查 | 终端报告 |
| `npm test` | 单元测试（node --test） | 终端报告 |
| `npm run check:functions` | 云函数静态校验 | 终端报告 |
| `npm run verify` | 以上全部一键门禁 | 终端报告 |

> 注意：H5 构建产物在 `dist/build/h5`（uni CLI 对 H5 的默认输出位），
> 小程序产物在 `unpackage/dist/build/mp-weixin`（小程序端惯例输出位），两者路径不同属正常现象。

## 5. 环境验证清单（Verification Checklist）

按顺序执行，全部通过即环境健康：

1. `npm run env:check` → 全部 ✔
2. `npm run build:h5` → 输出 `DONE  Build complete.`，`dist/build/h5/index.html` 存在
3. `npm run build:mp-wechat` → 输出 `DONE  Build complete.`，`unpackage/dist/build/mp-weixin/app.json` 存在，且 `pages` 数 = 5、`subPackages` 数 = 4
4. `npm run dev:h5` → 控制台 `ready in <10s`，浏览器打开 `http://localhost:5173` 返回 HTTP 200 且含 `<div id="app">`
5. `npm run lint` 与 `npm test` → 无报错（或用 `npm run verify` 一键跑完 2–5）

## 6. 常见问题（FAQ，均为实战踩坑实录）

### FAQ-1：构建报 `ENOENT ... src/manifest.json`（或 `Could not resolve './App'`）
**原因**：直接运行 `npx uni build`，CLI 找不到平铺布局的输入目录。
**解决**：一律使用 `npm run dev:*` / `npm run build:*`（经 `scripts/uni-run.js` 注入 `UNI_INPUT_DIR`）。

### FAQ-2：`.vue` 文件报 `Failed to parse source for import analysis ... Install @vitejs/plugin-vue`
**原因**：`vite.config.ts` 缺失或被改名（如被误改成 `.bak`/`.disabled`）。uni CLI **不会**自动注入插件，
`plugins: [uni()]` 是构建的唯一插件入口；同时 `package.json` 必须声明 `@dcloudio/uni-h5`
（H5 平台插件注册包，`apply: h5`，小程序端为 `@dcloudio/uni-mp-weixin`）。
**解决**：恢复 `vite.config.ts`（见仓库根），确认依赖声明齐全。
**预防**：不要重命名/移动 `vite.config.ts`（本项目历史上已发生 3 次误改）。

### FAQ-3：在 `.vue` 内使用 `import.meta.env` 导致 `[vite:define] esbuild 语法错误（JSX extension not enabled）`
**原因**：vite 的 `vite:define` 预转换器只排除 html/css/json，**会在 .vue 原始代码上**执行
`import.meta.env` / `process.env` 的文本替换，esbuild 解析原始 SFC 即报错。
注释里出现 `import.meta.env` 字样同样会命中匹配（文本级正则）。
**解决**：SFC 内一律从 `utils/cloud-env.ts` 导入变量；注释中不要出现该字面量。
**规范**：环境变量读取统一收口到 `utils/cloud-env.ts`（见文件头注释）。

### FAQ-4：小程序端报 `"normalizeCssVarValue" is not exported by "@vue/shared"`
**原因**：依赖树版本错配——hoisted 的 `@vue/shared@3.4.21`（@dcloudio 编译链依赖）与
hoisted 的 `vue/@vue/runtime-core@3.5.42` 并存，3.5 内核需要 3.5 新增导出。
**解决（已内建）**：`vite.config.ts` 的 `mpAliasFix()` 在小程序平台将裸导入 `@vue/shared`
重定向到 `@vue/runtime-core/node_modules/@vue/shared`（3.5 副本）；同时 `package.json`
已将 `vue`/`@vue/runtime-core` 精确锁到 `3.4.21`。开发机执行一次 `npm install` 对齐后，
嵌套副本消失，重定向自动失效（存在性检测，无需手工删除）。
> 注意：`package-lock.json` 中 `vue` 记录仍为 3.5.42，首次 `npm install` 会按新锁版本收敛；
> `npm ci` 在收敛前会报 lock 不一致，属预期。

### FAQ-5：小程序端报 `"isInSSRComponentSetup" is not exported by "vue.runtime.esm-bundler.js"`
**原因**：小程序端 `vue` 必须映射到 uni 的运行时分支 `@dcloudio/uni-mp-vue`（内含 uni 扩展导出）。
uni:mp 插件以**对象形态**返回 `resolve.alias`；用户侧若以**数组形态**提供自定义 alias，
经 vite `mergeAlias` 合并后会丢失该关键映射（实测结论）。
**解决（已内建）**：`vite.config.ts` 的 `mpAliasFix()` 在小程序平台以对象形态**同时显式声明**
`vue → @dcloudio/uni-mp-vue/dist/vue.runtime.esm.js` 与 `@vue/shared` 重定向，保证键序与优先级。
**规范**：如需增加小程序端别名，往 `mpAliasFix()` 返回的对象里加键（不要改成数组）。

### FAQ-6：`npm run build:mp-wechat` 产物没出现在 `unpackage/dist/build/mp-weixin`
**原因**：构建实际失败但被并行进程日志干扰，或误看 H5 的输出位。
**解决**：以命令结尾的 `Build complete.` 为准；小程序产物看 `unpackage/dist/build/mp-weixin`，
H5 产物看 `dist/build/h5`（见 §4 注意）。

### FAQ-7：端口 5173 被占用
`vite.config.ts` 已设 `strictPort: false`，自动 +1 顺延；如需固定端口，改 `server.port`。

### FAQ-8：微信开发者工具打不开项目
导入目录必须是**仓库根**（不是 `unpackage/dist/...`）；工具内「详情 → 本地设置」勾选
「不校验合法域名」以便联调云函数；AppID 来自根目录 `project.config.json` / `manifest.json`。

## 7. 与 HBuilderX 双工作流共存

- CLI 工作流（本文档）：`npm run dev/build:*`，经 `scripts/uni-run.js`。
- HBuilderX 工作流：直接用 HBuilderX 打开仓库根「运行/发行」；HBuilderX 会自行定位
  `vite.config.ts` 与平铺布局，两套工作流产物目录一致，可互换。
- 注意：两个进程同时编译同一目录可能产生瞬时文件竞争（本日实测出现过并行 dev 写入），
  建议**同一时间只用一套**。

## 8. 环境架构备忘（给后来维护者）

```
npm run build:mp-wechat
  └─ scripts/uni-run.js        注入 UNI_INPUT_DIR=仓库根（平铺布局适配）
      └─ uni CLI (vite-plugin-uni/bin/uni.js)
          └─ initEnv: UNI_PLATFORM / UNI_OUTPUT_DIR / UNI_CLI_CONTEXT
          └─ vite build（root=仓库根，config=vite.config.ts）
              ├─ plugins: [uni()]                 ← 唯一插件入口（FAQ-2）
              │    └─ resolvePlugins 扫 package.json 中带 uni-app 字段的包：
              │         @dcloudio/uni-app（cloud/push/stat）
              │         @dcloudio/uni-h5（H5 编译插件组，apply:h5）      ← FAQ-2
              │         @dcloudio/uni-mp-weixin（小程序编译插件组）
              ├─ uni:mp config() → resolve.alias{vue→uni-mp-vue,…}   ← FAQ-5
              └─ mpAliasFix()（对象形态合并，见 FAQ-4/FAQ-5）
```
