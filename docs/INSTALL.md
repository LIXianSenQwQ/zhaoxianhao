# 安装与运行说明

## ⚠️ 当前会话环境的已知限制

本会话运行在文件沙箱（仅 `D:\Desktop\赵县郝` 可写）与受限网络下，`npm install` **无法在本环境完成**：

- npm 默认缓存目录（`C:\Users\<user>\AppData\Local\npm-cache`）在沙箱可写范围外（已验证：EPERM）
- npm registry（registry.npmjs.org）对 `@dcloudio/*` 包返回 404（已验证：整包 404，非版本号问题）

因此 package.json 中 **不标注具体的 @dcloudio 日期版本号**（无法在本环境核实哪个版本存在，避免编造）。

## 正式开发机的两种安装路径

### 路径 A（推荐）：官方模板初始化后合并业务代码

```bash
npx degit dcloudio/uni-preset-vue#vite-ts haochengshi-client
# 将本仓库的 pages/ pkg-*/ components/ stores/ services/ utils/ styles/ static/
# 以及 pages.json manifest.json 合并进模板对应位置
npm install
npm run dev:mp-wechat
```

官方模板自带版本互相匹配的 @dcloudio 全家桶 + vite + sass + TS，避免手工对版本。

### 路径 B：HBuilderX 打开

用 HBuilderX（3.8+）直接「导入本目录」运行到微信开发者工具，依赖由 HBuilderX 内置管理。

## 云函数部署

1. 微信开发者工具 → 云开发 → 逐个上传 `cloud/functions/<name>`（13 个 MVP + auth）
2. 先运行 `database-init.js` 的 init（或手动建 42 个集合）
3. 在 settings 集合写入 `featureFlag` 开关表（默认值见 `utils/feature-flags.ts`）

## 本地缓存目录说明

`.npm-cache/`（若生成）是沙箱内重定向的 npm 缓存，已在 .gitignore 排除，可整目录删除。
