# F4 订阅消息技术对接 Checklist（蓝图 §7.9 通知编排 — 通道二）

> 目标：在并行进程完成 `notify/index.js` + `common/channel.ts` 后，进行外部依赖对齐与 stub 验证  
> 当前基线：commit `bfb9feb`（445 tests ✅ verify 全绿；§7.6/§7.8/隐私全覆盖已收口）

---

## 🔑 外部依赖（微信开发者中心）

| # | 任务 | 步骤摘要 | 产出物 | 状态 |
|---|------|----------|--------|------|
| **T1** | 开通订阅消息能力 | 微信公众平台 → 开发管理 → 接口权限 → 订阅消息 | 功能已启用 | ☐ |
| **T2** | 创建业务模板 | 微信公众平台 → 订阅模板 → 选择或自定义模板 → 提交审核 | 通过审核的 `templateID` | ☐ |
| **T3** | 登记模板映射 | `cloud/functions/common/settings.schema.json`：新增 `settings.subscribeTemplates` `{key: templateId}` 表 | JSON Schema 更新 + 文档说明 | ☐ |
| **T4** | 配置小程序环境 | 云开发控制台 → 云函数 → `notify` → 环境变量：`SUBSCRIBE_MSG_ENABLED=true`（可按需开关） | env var 设置完毕 | ☐ |
| **T5** | 开放 API 权限 | `cloud/functions/notify/config.json`：`openapi: ["subscribeMessage.send"]` | 配置文件已写入 | ☐ |

---

## 🧪 Stub 验证（本地模拟发送）

```javascript
// cloud/functions/notify/index.js
// 动作：sendSubscribe({ toUser, templateKey, data })

// 测试步骤：
// 1. seedDB：users[{openid:'u-editor',role:'EDITOR'}] + settings([{key:'subscribeTemplates',value:'{"home_update":"tpl_xyz"}'})
// 2. call：FN('notify').main({ action: 'subscribeMsg.send', toUser: 'u-target', templateKey: 'home_update', data: {...} }, ctx)
// 3. expected：{ sent:false, reason:'stub-no-wx-openapi', simulated:true }（真实环境为 wx.openapi 调用返回 ok/sent:true）
```

> **stub 环境行为**：`wx.openapi` 不可用时自动降级静默（不报错、OK+sent:false），便于 CI 验证。

---

## 🔐 门禁与安全（代码侧）

- **角色门禁**：仅 EDITOR+ 可触发 `notify.dispatch` / `subscribeMsg.send`（见 `notify/index.js`）
- **参数校验**：
  - `toUser`：必须为非空 openid
  - `templateKey`：必须在 `settings.subscribeTemplates` 中注册
  - `data`：字段数≤6；每项 value 截断至 20 字
- **审计日志**：`notify.subscribe.send` → `audit_logs`（userId、target、templateKey）
- **幂等性**：建议前端/后端对同一次用户触发做防重（如 session id 暂存 Redis/Cloud KV，非本次强制要求）

---

## 🚦 灰度上线前核验清单（G1-G5 扩展）

| # | 核查项 | 命令/位置 | 预期结果 |
|---|--------|-----------|----------|
| C1 | schema 齐备 | `npm run check:functions` | 无语法错误 |
| C2 | 接口不变性 | `npm run check:gateway` | 28 文件无破坏变更 |
| C3 | stub 验证成功 | `node --test --test-isolation=none tests/module-audit.test.js --test-name-pattern="channel"` | test pass（若实现 stub） |
| C4 | 模板 ID 登记 | `cloud/common/settings.schema.json` | `subscribeTemplates` key 存在且合法 |
| C5 | openapi 权限 | `cloud/functions/notify/config.json` | `"subscribeMessage.send"` in list |

---

## 📋 合并与回滚（待并行进程完成 §7.9 核心后）

1. **合并**：PR 从 `feature/notify-channel` → `dev`，覆盖 `notify/index.js` + `common/channel.ts` + `settings.schema.json`
2. **回滚点**：若发布后出现误发/漏发 → `git revert feature/notify-channel HEAD^..HEAD` + 云函数回滚到上一可用版本
3. **监控指标**：
   - `audit_logs.action == "notify.subscribe.send"` 成功率≥99%
   - 失败码分布（template 未注册 / 数据格式错误 / openapi 异常）占比<1%

---

## 📎 参考链接

- 蓝图书 §7.9 通知编排
- GRAY-DEPLOYMENT-PLAN.md（放量策略）
- ROLLBACK-CLONE.md（回滚演练脚本）
- RELEASE-NOTES.md（v2.0.0 交付清单）
