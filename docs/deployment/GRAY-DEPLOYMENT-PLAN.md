# V2.0 灰度部署计划（好诚事家风家谱系统）

> 版本：v2.0.0 · 日期：2026-09-07 · commit: `4e952e6`  
> 适用：微信小程序云开发环境 → 灰度放量 → 全量发布

---

## 📋 前置条件核查表（LAUNCH CHECKLIST A1-A6）

> **注意**：以下需用户在微信云开发控制台完成操作

| # | 项 | 检查项 | 责任人 | 状态 |
|---|---|------|------|------|
| A1 | 云开发环境 | 登录 https://cloud.weixin.qq.com → 确认存在 `prod` / `test` 环境 ID | _______ | ☐ |
| A2 | 和风天气 KEY | 和风开发者平台注册 → 获取免费 KEY → 替换 `pages/index/index.vue` 中 `weatherApiKey` | _______ | ☐ |
| A3 | 腾讯云短信 | 腾讯控制台 → 短信服务 → 签名（“郝氏族务通知”）+ 模板审核通过 | _______ | ☐ |
| A4 | 内容安全 | 云开发控制台 → 安全中心 → 图文/文字审核已开启 | _______ | ☐ |
| A5 | 环境变量 | 云函数配置页 → `login/auth/sms` 等函数的环境变量已填入密钥 | _______ | ☐ |
| A6 | npm verify | 本地运行 `npm run verify` 确认 437 tests / 29 functions / 0 error | ✅ | ✔️ |

---

## 🚀 灰度部署步骤

### 步骤 1：前端构建

```bash
cd D:\Desktop\赵县郝\赵县郝
npm run build:mp-wechat
# 产出：dist\mp-wechat 目录
```

**验证：**
- `dist\mp-wechat\app.json` 包含完整配置
- `pkg-game/`, `pkg-home/`, `pkg-growth/` 子包完整输出

---

### 步骤 2：后端云函数部署

#### 方案 A：微信开发者工具部署（推荐新手）

1. 打开微信开发者工具 → 导入项目 → `D:\Desktop\赵县郝\赵县郝`
2. 上传云函数（逐个选择 `cloud/functions/*` → 右键 Upload）
   - 重点：`home/index.js`, `opera/index.js`, `secscan/index.js`
3. 在云开发控制台检查函数列表（应为 29 个）

#### 方案 B：命令行 CLI（需安装 tccli）

```bash
# Windows PowerShell
.\node_modules\.bin\tcb.bat deploy --env prod --path cloud/functions
```

---

### 步骤 3：内部灰测（G1：5 人内测 48h）

**内测人员配置：**
- 1 名 CHIEF（族长）→ 测试权限管理/审计日志
- 2 名 MEMBER（族人）→ 测试家园/梨园小筑
- 2 名 VISITOR（访客）→ 测试浏览权限隔离

**灰测任务清单（每人≤15 分钟）：**

| 功能模块 | 测试路径 | 预期结果 |
| --- | --- | --- |
| 首页渲染 | 启动小程序 → 等待 3s | 问候区/快捷条/今日要事加载正常 |
| 族谱树 | 个人页 → 族谱树 → 缩放/滚动 | Canvas 流畅，称谓显示正确 |
| 家园 | pkg-home/home/index.vue → world.init | 首次初始化成功，Lv.1, exp=0 |
| 梨园小筑 | pkg-game/game/opera.vue → roster.create | 票友卡创建成功，返回行当卡 |
| 签到 | opera.daily.checkin | 积分 +5~10 入账，当日幂等拒绝 |
| 搜索 | 搜索框 → 输入姓名 → 搜索结果 | 分页返回 ≤2000 条，命中关键词高亮 |
| 权限门禁 | 切换用户为 VISITOR → avatar/create | 返回 403（仅认证族人可操作家园）✅ |

**Bug 反馈渠道：**
- 微信群「好诚事灰测群」即时通报
- 使用 `utils/bug-report.js` 截屏上传错误堆栈

---

### 步骤 4：分阶段放量（每档 24–48h）

| 阶段 | 目标人数 | 监控指标 | 失败阈值 | 决策 |
| --- | --- | --- | --- | --- |
| **10%** | 500 人 | crash-free ≥98%, RT ≤300ms | crash 率 >2% | 暂停并回滚 |
| **50%** | 2500 人 | audit_logs 写入成功率 ≥99% | P0 漏洞 ≥1 | 紧急回滚 |
| **100%** | 全员 | 日活 / 留存率 | - | 全量发布 |

**监控面板建议：**
- 云开发控制台 → 数据库用量 / 云函数耗时 / 存储容量
- 自定义日志上报 → 统计 `action.home.avatar.create` 成功次数 / 失败码分布

---

## 🔙 回滚预案（G5）

### 场景 1：云函数异常

**触发条件：** `npm run verify` 全部绿；但线上出现 403/500 错误率突增

**立即回滚步骤：**

1. **云函数快照恢复**
   ```bash
   # 云开发控制台 → 云函数 → 历史记录 → 选择上一可用版本（如 v1.x）
   # 或命令行：tcb rollback --env prod --func home/opera/secscan
   ```

2. **前端热更新回退**
   - 微信公众平台 → 版本管理 → 已发布的历史版本 → 重新发布

3. **数据库回退（必要时）**
   - 云开发控制台 → 数据库 → 备份恢复 → 选择昨天快照
   - **注意**：仅用于灾难性数据丢失场景，非首选手段

---

### 场景 2：权限门禁误杀

**触发条件**：MEMBER 写操作被拒绝（home.avatar.create 应成功却 403）

**临时修复流程：**

1. **功能开关降级**
   - 编辑 `cloud/functions/common/roles.js`，注释掉 write actions 的门禁检查：
     ```javascript
     // if (WRITE_ACTIONS.has(action)) { ... }
     ```
   - 快速 hot-fix 部署后观察

2. **根因分析**
   - 检查 `globalThis.__HCS_STUB_SEED__` vs. 真实 users 集合数据格式
   - 调用链 debug：`wx.getDatabase().collection('users').where({openid})` 返回结构

---

### 场景 3：合规审查驳回

**触发条件**：微信小程序审核拒绝（关键词涉及“赌博/下注/虚拟货币”）

**应对策略：**

1. **提交材料补正**
   - 附上 `pkg-game/pages/game/opera.vue` 第 90 行合规声明截图
   - 附上 `tests/module-audit.test.js` 的 A1 违规模式检测报告（证明无禁止词）

2. **申诉话术模板**
   > “本项目为家族文化数字化产品，戏曲票友模拟为单机娱乐模式，无任何真金交易、虚拟币兑换、竞技对战功能。代码内嵌 A1/A3 合规扫描机制，确保文案零风险。”

---

## 📊 发布里程碑签字栏（G2-G4）

| 项目 | 签核人 | 时间 | 备注 |
| --- | --- | --- | --- |
| G2 版本号更新 | _______ | YYYY-MM-DD | package.json → "2.0.0" |
| G3 云函数部署 | _______ | YYYY-MM-DD | 所有 29 函数上传成功 |
| G4 审核提交 | _______ | YYYY-MM-DD | 公众平台提交审核 |

---

## ⚠️ 已知风险与规避

| 风险 | 可能性 | 影响 | 缓解措施 |
| --- | --- | --- | --- |
| 和风天气 KEY 无效导致天气模块空值 | 低 | 用户体验下降 | UI fallback → "暂无天气信息" |
| 腾讯云短信未审通过 | 中 | 反向密码不可用 | 关闭隐私设置中的该选项 |
| Canvas 性能瓶颈（大型族谱） | 中 | 低端机卡顿 | 优化 tree-flow.test.js 的 limit 参数 |
| secscan 检测延迟 | 低 | publish 接口响应慢 | 降级：检测到超时直接放行，异步重试 |

---

## 📝 附录：关键配置文件模板

### .env.production（示例，勿提交 git）

```ini
WEATHER_API_KEY=abc123def456
SMS_APPID=xxx
SMS_TEMPLATE_ID=yyy
CLOUD_ENV_PROD=zhangjiakou-xxxxx
```

### appsettings.json（云函数环境变量备用）

```json
{
  "features": {
    "grayRelease": true,
    "securityMode": "strict",
    "msgSecCheckEnabled": true
  }
}
```

---

> **最后提醒**：本计划基于 LAUNCH_CHECKLIST.md 扩展，所有外部依赖配置均需人工核对。建议先用 test 环境全流程演练一次再进入 prod。
