# Staging Environment 部署指南

**版本**: v1.0  
**目标**: 将 V2.0 R31–R34 变更部署至 Staging 环境并启动 72 小时监控  

---

## 🚀 部署前置条件

### 环境检查清单

```bash
# 1. 确认 Node.js 版本
node --version          # 必须 >= 18 且 <= 25

# 2. 确认测试全绿
npm test                # 期望: 682/682 (100%) pass

# 3. 确认云函数语法
npm run check:functions # 期望: 0 errors

# 4. 确认环境变量注入
npm run check:env       # 期望: 0 errors

# 5. 生成本地 Artifact Bundle
npm run deploy          # 输出: deploy-prep/production/
```

### 微信云开发环境配置

| 项目 | 值 | 说明 |
|------|----|----|
| Cloud Env ID | `hcs-staging-xxxx` | 在微信开发者工具查看 |
| Database Region | 上海 | 就近原则 |
| Storage Bucket | hcs-staging-files | 上传 GEDCOM/图像 |
| Cloud Functions Runtime | Node.js 18 | 与本地一致 |

---

## 📦 Cloud Functions 部署清单

### 需部署的函数（共 6 个关键改动）

| Function Name | Action | 依赖包 |
|--------------|--------|--------|
| `entry` | 重部署 (R31 通知+公示) | wx-server-sdk |
| `gedcom` | 全新部署 (R32) | 无外部依赖 |
| `admin` | 重部署 (R33 v20Roots flag) | 无外部依赖 |
| `branch` | 重部署 (R34 scope) | 无外部依赖 |
| `common` (npm module) | 全新部署 (R34 branch-scope.js) | — |
| `rootseek` | 重部署 (R33 根脉数据接口) | 无外部依赖 |

### 部署命令（微信开发者工具方式）

1. 打开微信开发者工具 → 选择 `D:\Desktop\赵县郝` 项目
2. 切换至 Staging 环境（右上角环境切换）
3. 依次右键以下目录 → **上传并部署：云端安装依赖**：
   ```
   cloud/functions/entry
   cloud/functions/gedcom
   cloud/functions/admin
   cloud/functions/branch
   cloud/functions/rootseek
   ```
4. 等待部署完成（每个函数约 30-60 秒）

### 命令行方式（CI/CD 推荐）

```bash
# 安装 CLI
npm install -g @wechat-cloud/cli

# 登录（首次需扫码）
tcb login

# 部署 staging
tcb fn deploy entry --env hcs-staging-xxxx --force
tcb fn deploy gedcom --env hcs-staging-xxxx --force
tcb fn deploy admin --env hcs-staging-xxxx --force
tcb fn deploy branch --env hcs-staging-xxxx --force
tcb fn deploy rootseek --env hcs-staging-xxxx --force
```

---

## 🗄️ 数据库 Schema 部署

### 新增/修改 Collections

```bash
# 1. 上传 users.schema.json (branchCode 字段)
#    通过微信开发者工具 → 云开发控制台 → 数据库 → users → 结构管理

# 2. 创建 dna_records collection（占位，无数据）
#    通过云开发控制台 → 数据库 → 新建集合 → 命名 dna_records

# 3. 创建 v20_roots collection（根脉数据）
#    通过云开发控制台 → 数据库 → 新建集合 → 命名 v20_roots

# 4. 导入种子数据
node scripts/seed-v2-features.js --env=staging
```

### 索引配置

```javascript
// users collection
db.users.createIndex({ openid: 1 }, { unique: true, name: 'openid_unique' })
db.users.createIndex({ role: 1 }, { name: 'role_idx' })
db.users.createIndex({ branchCode: 1 }, { name: 'branch_code_idx', sparse: true })

// entry_records collection
db.entry_records.createIndex({ status: 1, publicityDeadline: 1 }, { name: 'publicity_deadline_idx' })

// v20_roots collection
db.v20_roots.createIndex({ type: 1, order: 1 }, { name: 'type_order_idx' })
```

---

## ✅ 部署后 Smoke 测试

### 立即执行清单（部署后 5 分钟内）

```bash
# Test 1: Feature flag sync check
curl -X POST https://hcs-staging-xxxx.service.tcloudbase.com/admin \
  -H "Content-Type: application/json" \
  -d '{"action": "getFeatureFlag", "key": "v20Roots"}'
# Expected: { success: true, data: { enabled: true } }

# Test 2: Entry audit scope enforcement
# Using test account: openid=u-bh-long (BRANCH_HEAD, branchCode=long)
# Attempt to audit record with branchId=chang
# Expected: 403 Forbidden

# Test 3: Roots data endpoint
curl https://hcs-staging-xxxx.service.tcloudbase.com/rootseek \
  -d '{"action": "getLandmarks"}'
# Expected: 4+ landmark records from v20_roots collection

# Test 4: Gedcom export
curl https://hcs-staging-xxxx.service.tcloudbase.com/gedcom \
  -d '{"action": "export", "format": "5.5.1"}'
# Expected: Content-Type: application/octet-stream, valid .ged file
```

### 移动端预览检查

- [ ] 首页 RootsSection 组件显示（v20Roots=true 时）
- [ ] 地标轮播自动播放，点击展开详情
- [ ] 时间轴滚动流畅（60fps）
- [ ] 英烈卡片跳转 /pkg-shrine 正常
- [ ] 素色追思卡点击跳转祭祀页面
- [ ] GEDCOM 导入页面可粘贴内容并生成预览
- [ ] 入谱审核页公示期倒计时动态显示

---

## 📊 监控指标配置

### CloudWatch / 云开发监控台

| 指标 | 阈值 | 告警动作 |
|------|------|---------|
| Cloud Function Invocation Errors | > 5% | SMS + 飞书群通知 |
| Cold Start Duration (p99) | > 2s | 邮件通知 |
| Database Read Latency (p99) | > 200ms | 邮件通知 |
| Entry Audit Publicity Deadline Calc Errors | > 0 | 立即 SMS |
| Gedcom Parse Timeout Rate | > 1% | 立即 SMS |
| Storage Upload Failures | > 3/hour | 邮件通知 |

### 日志聚合

```bash
# 查看关键审计日志
tcb db query audit_logs \
  --where '{"action": {"$in": ["entry.publicity.start", "entry.publicity.pass", "entry.audit.denied"]}}' \
  --sort '{"createdAt": -1}' \
  --limit 50

# 检查 branchScope 拦截日志
tcb db query audit_logs \
  --where '{"action": "entry.audit.denied", "detail": {"$regex": "branchScope"}}'
```

---

## 🔄 回滚方案

### 触发条件（24h 内）

- Critical bug 导致用户无法提交入谱申请
- 数据一致性问题（成员关系链损坏）
- Feature flag 切换导致整个 RootsSection 白屏

### 回滚步骤

```bash
# Step 1: Disable v20Roots feature flag
tcb fn invoke admin --env hcs-staging-xxxx \
  --data '{"action": "setFeatureFlag", "key": "v20Roots", "enabled": false}'

# Step 2: Revert cloud function to previous version
tcb fn update entry --env hcs-staging-xxxx \
  --code ./backup/entry-v1.9.0.zip

# Step 3: Restore schema backup (CRITICAL — only if data corruption)
tcb db import backup/users_last_good.json --collection users

# Step 4: Notify users
# Via cloud function → notify.broadcast
tcb fn invoke notify --data '{"action": "broadcast", "message": "系统已临时回退至稳定版本，恢复后另行通知"}'
```

### 回滚验证

- [ ] 所有功能回归测试通过（跑 `npm test` 本地）
- [ ] 用户端再次可正常提交入谱
- [ ] RootsSection 隐藏或恢复旧版本
- [ ] GEDCOM 导入功能回退到 v1.9 的手工 CSV 导入

---

## 📅 时间表

| Phase | Day | Activity |
|-------|-----|----------|
| Pre-deploy | D-1 | All checks pass, backup created |
| Deploy | D0 | Cloud functions + DB schema upload |
| Smoke Test | D0+5min | 4 curl tests + 7 mobile checks |
| Monitor | D0-D3 | 72h log monitoring + alert response |
| Feedback | D3 | Collect Clan Historian feedback |
| Decision | D4 | Go/No-Go for Canary rollout |

---

## 📞 关键联系人

| 角色 | 联系方式 | 职责 |
|------|---------|------|
| Dev Lead (Qoder) | qoder.ai@internal | 技术决策、回滚命令 |
| Ops Engineer | oncall@devops.haoshi.org | 部署执行、监控响应 |
| Clan Historian Rep | 待指定 | 内容审查、用户体验反馈 |
| Clan Chief | 待指定 | 最终 Go/No-Go 决策 |

---

**文档版本**: v1.0  
**最后更新**: 2026-09-XX  
**适用环境**: Staging (hcs-staging-xxxx)
