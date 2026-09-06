# secscan 内容安全检测 · 生产接入指引

> 配套：`cloud/functions/secscan/index.js`（已实现：敏感词库 + msgSecCheck/imgSecCheck 双通道降级）
> 文档：V2.0 开发框架第九部分 9.2、三十二 23.2（对接）、附录 C 合规红线

## 一、现状（已完成，2026-09-06 基线）

| 能力 | 实现 | 测试覆盖 |
|------|------|---------|
| `detectText` | 敏感词库（28 词基线）→ 未命中再调 msgSecCheck → 均通过才 `pass` | ✅ V2 secscan tests |
| `detectImage` | 校验 sourceType → 取 tempFileURL → 调 imgSecCheck | ✅ sourceType 校验 |
| 审计 | block/pass 均写 audit_logs（action=secscan.text.block / secscan.text.block_api / secscan.image.block） | ✅ |
| 降级 | API 不可用时回退敏感词库结果，不阻断正常业务 | ✅ stub 环境验证 |

## 二、生产环境接线（需在云开发控制台完成）

### 2.1 开通微信内容安全服务（msgSecCheck）

**前置条件**：小程序已通过主体认证（企业/组织主体）。

在微信小程序管理后台：
1. 左侧「开发」→「开发管理」→「接口设置」→ 找到「内容安全」类目；
2. 开通 `msgSecCheck`（文本安全检测）与 `imgSecCheck`（图片安全检测）；
3. 确认调用额度（免费额度内可直接调用，超出需按量付费）。

### 2.2 创建 msgSecCheck / imgSecCheck 云函数

```bash
# 在 cloud/functions/ 下分别创建两个薄封装云函数
```

**msgSecCheck/index.js**（薄封装，示例）：
```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      content: event.content,
      // 新版 API 需要 version=2 与 openid（可选）
      version: 2,
      openid: event.openid || ''
    });
    // 合规：errCode=0
    return { errCode: res.errCode, errMsg: res.errMsg, suggest: res.result?.suggest };
  } catch (e) {
    // 云调用失败透传（供 secscan 降级）
    return { errCode: e.errCode || -1, errMsg: e.errMsg || e.message };
  }
};
```

**imgSecCheck/index.js**（薄封装，示例）：
```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  try {
    const res = await cloud.openapi.security.imgSecCheck({
      media: { contentType: 'image/png', value: Buffer.from(/* 需先取图转 Buffer */) }
    });
    return { errCode: res.errCode, errMsg: res.errMsg };
  } catch (e) {
    return { errCode: e.errCode || -1, errMsg: e.errMsg || e.message };
  }
};
```

> ⚠️ 注意：新版 `imgSecCheck` 入参为 **Buffer**（非 URL）。生产需在 secscan 内先 `cloud.getTempFileURL` 后经 HTTP 拉取图片流再转 Buffer 传入，或改用 `mediaCheckAsync`（异步，支持 URL，结果回调）。

### 2.3 生产建议：异步图片检测

微信 `mediaCheckAsync` 支持 URL 异步回调，适合大图/批量场景：

| 方案 | 同步 imgSecCheck | 异步 mediaCheckAsync |
|------|----------------|---------------------|
| 入参 | Buffer（≤1MB） | URL（≤10MB 原图） |
| 返回 | 即时 | 回调通知 |
| 适用 | 小图即时校验 | 上传后的相册/动态图片 |

**推荐策略**：头像/封面等 ≤1MB 走同步 `imgSecCheck`；相册/动态原图走 `mediaCheckAsync`，回调里更新 `backupStatus`/`secStatus`。

## 三、接入各业务模块（对接点）

| 模块 | 触发时机 | 调用 | 失败处理 |
|------|---------|------|---------|
| 动态（moment） | 发布前 | detectText（正文）+ detectImage（媒体） | block → 前端提示含敏感内容；API 降级 → 允许但标记待复核 |
| 本地内容（content） | content.save 前 | detectText（标题+正文） | 同上 |
| 评论/互动 | 写入前 | detectText | block → 拒绝写入 |
| 家训/问候语 | submit 前 | detectText | block → 拒绝 |
| 头像/相册 | 上传回调后 | detectImage | block → 通知用户并撤回 |
| 公告/紧急广播 | 发布前 | detectText（强制，不降级跳过） | block → 必须更换内容 |
| 灯谜/题库投稿 | 审核前 | detectText | 进人工复核队列 |

## 四、敏感词库维护

`cloud/functions/secscan/index.js` 顶部 `SENSITIVE_WORDS` 数组当前 28 词（政治/涉黄/涉赌/诈骗/暴力/违法/黑产七类）。

**维护建议**：
1. 每季度由族史委 + 安全负责人复核增补；
2. 敏感词入库前经 secscan.detectText 自检（防误伤正常文本）；
3. 家族词（梨花节、郝公等）确认不在命中清单内（现有测试已覆盖）。

## 五、测试与门禁

| 项 | 覆盖 |
|----|------|
| 单元测试 | `V2 secscan.detectText: 敏感词命中返回 block`、`msgSecCheck 降级正常文本仍 pass`、`sourceType 校验` |
| stub 降级验证 | 测试环境无 errCode → 视为 API_unavailable → 不误判 |

## 六、变更记录

| 日期 | 版本 | 变更 | 责任人 |
|------|------|------|--------|
| 2026-09-06 | v1 | 初版（敏感词库 + 双通道降级 + 审计），commit f3de416 | Dev |