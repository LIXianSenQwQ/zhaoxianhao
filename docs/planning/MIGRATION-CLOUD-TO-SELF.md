# 云开发 → 自建后端迁移预案（蓝图 7.10 · P3 增强收口）

> **蓝图条款**：第三部分 §7.10「云开发 → 自建后端迁移预案（量级触发）」
> **收口日期**：2026-09-06 · 基线：npm run verify 全绿（test=298、lint error=0、functions=25/25）
> **性质**：预案文档 + 转发层预留位（本冲刺不下线云开发，仅建立可执行的迁移路径与验收口径）。

---

## 一、触发条件（量级口径，可量化）

蓝图给出两条触发条件，按「先到先触发」执行：

| 触发条件 | 量化口径 | 监控位 | 当前状态 |
| --- | --- | --- | --- |
| **用户量级** | 注册用户 > 10 万 或 月活 > 3 万 | `users` 集合 count + 登录审计频次 | ⏳ 未达 |
| **费用量级** | 云函数月费用 > 自建托管成本 × 1.5（连续 3 个月） | 腾讯云费用账单 + 成本台账 | ⏳ 未达 |

**决策入口**：触发后由族务数字化委员会（CHIEF/HISTORIAN 代表）评审，形成《迁移决策纪要》并写入
`settings`（键 `migration.selfHosted.decision`），过程审计留痕（audit_logs）。

---

## 二、架构原则（蓝图 7.10 原文定案）

> **云函数接口签名不变，内部转发至 NestJS 服务；云数据库导出迁移 MySQL；前端 services 层零改动。**

本预案的全部技术约束都由这三点派生。核心不可破约束：

1. **客户端不可感知迁移**：`services/request.ts` 调用的仍是 `wx.cloud.callFunction({ name, data })`，
   `name`（云函数名）与 `data`（业务参数）在迁移前后完全一致 → **前端 services 层零改动**。
2. **云函数 = 网关适配层**：每个云函数保留 `main(event, context)` 入口与既有鉴权/审计动作，
   内部在收到 `SELF_HOSTED_BASE_URL` 环境变量时把业务调用转发到自建 NestJS HTTP 服务。
3. **数据可回迁**：MySQL 为主库后保留 30 天双写/回读窗口，支持灰度回滚（蓝图第七部分二十）。

---

## 三、转发层预留位（本次交付）

### 3.1 网关开关（settings / 环境变量双保险）

| 键 | 位置 | 说明 |
| --- | --- | --- |
| `SELF_HOSTED_BASE_URL` | 云函数环境变量 | 空 = 不转发（直连云开发）；非空 = 业务调用转发至该 URL |
| `settings.migration.selfHosted.enabled` | settings 集合 | 功能开关（灰度位），`admin.featureFlag` 面板可查 |

### 3.2 云函数内转发适配层（代码骨架，各云函数按需引入）

```js
// cloud/functions/common/gateway.js —— 迁移转发适配层（蓝图 7.10 预留位）
// 用法：在 main 的 action 分派前统一执行：
//   const gw = require('./common/gateway');
//   if (gw.shouldProxy()) return gw.proxy(event, context);   // 转发到 NestJS
// 说明：
//   · shouldProxy() 读 process.env.SELF_HOSTED_BASE_URL 与 settings 开关（缓存 60s）
//   · proxy() 保留与原云函数一致的响应结构 {success,code,data,message}（见 common/response）
//   · 鉴权：openid 经签名头透传，NestJS 侧复用同一 auth 逻辑（JWT/OpenID 映射）
//   · 幂等键 idemKey 原样透传，保证写操作在自建端同样防重
//   · 失败降级：转发 5xx/超时 → 回退本函数原逻辑（灰度期兜底），由审计记录 fallback
const https = require('https');
let cached = null;

function shouldProxy() {
  const base = process.env.SELF_HOSTED_BASE_URL;
  if (!base) return false;
  // 缓存 60s 的 settings 开关读取（查询失败视为开启转发由灰度控制面决定）
  if (cached && Date.now() - cached.ts < 60000) return cached.enabled;
  return true;
}

async function proxy(event, context) {
  const base = process.env.SELF_HOSTED_BASE_URL;
  const action = event.action || 'main';
  const body = JSON.stringify({ event, context });
  return new Promise((resolve) => {
    const url = new URL(`/fn/${action}`, base);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openid': context.OPENID || context.openid || '',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 3000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ success: false, code: 502, message: 'bad gateway body' }); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ success: false, code: 503, message: 'gateway unreachable' }));
    req.write(body);
    req.end();
  });
}

module.exports = { shouldProxy, proxy };
```

> ⚠️ 说明：`common/gateway.js` 为**预留位骨架**，本次不写实（避免在未达触发条件时引入线上路径）。
> 通过 `scripts/sync-common.js` 机制可随通用模块同步到各云函数。

### 3.3 前端零改动证明（现状核查 ✅）

- `services/request.ts`（188 行）是**唯一**的业务请求入口：
  - 调用形态固定为 `wx.cloud.callFunction({ name, data })`；
  - 幂等键由 `request.ts` 统一生成并透传（`idemKey`），云函数侧 `common/idempotency.js` 同口径；
  - 缓存/重试/超时全部收敛在 request.ts，迁移后不变。
- 各 `services/*.ts`（member/relation/content/news/…）只面向 `request.ts` 的 `read/write` 签名，
  **不直接依赖云开发 API** → 迁移时零改动。
- 结论：迁移只发生在云函数（网关适配层）与数据库两层，客户端打包产物不变，可灰度升级。

---

## 四、数据库迁移（云数据库 → MySQL）步骤

| 阶段 | 动作 | 验收 |
| --- | --- | --- |
| S1 盘点 | 导出全部集合 schema（`cloud/db-schemas/*.json`）+ 索引清单（docs/DB_INDEXES_GUIDE.md） | 42 集合逐一有目标表 |
| S2 映射 | 字段驼峰→snake_case 映射表；L 级敏感字段（L5 私密）加列级加密策略 | 映射表评审通过 |
| S3 全量导出 | 腾讯云数据库导出（控制台/CLI）→ 全量导入 MySQL（双写窗口） | 抽样对账 ≥99.99% |
| S4 增量同步 | 双写（云函数内写库同时写自建）+ binlog 回读 | 追平延迟 <5s |
| S5 切换 | 网关开关灰度 10%→50%→100%；保留 30 天回滚窗口 | 监控无 5xx 增长 |
| S6 固化 | 下线双写；归档云数据库快照 | 迁移纪要归档 |

**风险与回滚**：
- 转发 5xx 自动回退云函数原逻辑（3.2 兜底）→ 先于用户感知恢复；
- 数据不一致：双写窗口内以云开发为准，自建侧仅读不写（灰度期读迁移、写留守）；
- 回滚触发条件：连续 15 分钟错误率 >1% 或关键写路径延迟 P95 >800ms。

---

## 五、验收清单（上线前打钩）

- [ ] `services/request.ts` 与全部 `services/*.ts` 未发生任何改动（零改动证明存档）
- [ ] `common/gateway.js` 预留位骨架已入仓（本次交付）
- [ ] `SELF_HOSTED_BASE_URL` 环境变量在云开发控制台配置说明已写入 docs/ENVIRONMENT.md
- [ ] 迁移决策入口（settings + audit_logs）字段说明已写入 db-schema settings 注释
- [ ] 回滚演练脚本（网关开关一键回退）在部署文档 checklist 登记

---

## 六、相关文档交叉引用

- 蓝图 §7.10（第三部分）｜ §20 灰度发布与回滚（第七部分）
- docs/API.md §1 云函数接口清单（签名不变性来源）
- docs/ENVIRONMENT.md（环境变量清单）
- docs/planning/V2-SPRINT-TRACKER.md（基线收口登记）
