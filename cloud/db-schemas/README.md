# 云数据库集合定义 (Schemas)

> 版本：v1.0｜更新：2026-09-06  
> **纪律：仅云函数可读写，客户端禁止直连**

## 目录

- [快速导入](#快速导入)
- [集合清单](#集合清单)
- [字段速查](#字段速查)
- [权限与索引](#权限与索引)
- [维护指南](#维护指南)

---

## 快速导入

```bash
cd cloud/db-schemas
node schema-consistency-test.js
```

校验通过后方可部署到云开发环境。

---

## 集合清单

| # | 名称 | 用途 | MVP/V1.1 |
|---|------|------|----------|
| 1 | users | 用户/角色体系 | ✅ |
| 2 | members | 族谱成员实体 | ✅ |
| 3 | relations | 血缘连接表 | ✅ |
| 4 | generations | 字辈表 | ✅ |
| 5 | branches | 房支 | ✅ |
| 6 | entry_records | 智能入谱申请 | ✅ |
| 7 | documents | 谱库文档 | ✅ |
| 8 | events | 大事记/讣告 | ✅ |
| 9 | worship_logs | 祭祀记录 | ✅ |
| 10 | ceremonies | 仪式红白事 | ✅ |
| 11 | plaza_posts | 广场动态 | ✅ |
| 12 | notifications | 站内通知 | ✅ |
| 13 | calendar_items | 日历项 | ✅ |
| 14 | points_accounts | 积分账户 | ✅ |
| 15 | points_logs | 积分流水 | ✅ |
| 16 | tasks | 任务定义 | ✅ |
| 17 | task_records | 打卡记录 | ✅ |
| 18 | audit_logs | 审计日志 (append-only) | ✅ |
| 19 | authorizations | 授权关系 | ✅ |
| 20 | settings | KV 配置 | ✅ |
| 21 | auth_requests | 授权申请 | ✅ |
| 22 | upload_metas | 上传元数据 | ✅ |
| 23 | media | 媒体索引 (预留) | V1.1 |
| 24 | chat_groups | 聊天群 (预留) | V2.0 |
| 25 | research_sources | 史料引证体系 (研究) | ✅ |
| 26 | oral_interviews | 口述史访谈档案 (研究) | ✅ |
| 27 | folk_customs | 民俗活动田野记录 (研究) | ✅ |
| 28 | research_profiles | 人物学术档案 (研究) | ✅ |

> 研究类集合（25–28）的录入纪律见 `docs/research/01-研究方法与学术规范.md`：A/B 级史料必须有可检索位置或原始载体方可置 verified；禁止虚构条目。

---

## 字段速查

### 核心实体

**members**: path(genealogyName generation branchId gender status linkedOpenid deeds motto heroNote)  
**users**: openid nickName avatarUrl role(status privacyDefault lastLoginAt)  
**relations**: fromId toId type  

### 业务数据

**entry_records**: idemKey(type ocrConfidence payload auditChain status reviewedBy reviewComment)  
**documents**: title type era fileId thumbUrl ocrText contributorId level(size status)  
**events**: type(title content year images status) ← 白事静默源 (status=ACTIVE && type=funeral)  
**ceremonies**: type(title desc date status location) ← homecards 卡流置顶源  

**plaza_posts**: authorId(authorName) type(content mediaIds stats visibility publishAt status)  
**notifications**: userId(type level title body scope targetRoute read createdAt createdBy)  
**calendar_items**: userId(type title desc date notified)  

**points_accounts**: userId(xiaoqin gongde fuyun normal)  
**points_logs**: userId(pool amount bizType bizId idemKey operatorId note time)  
**tasks**: title(desc points pool category status)  
**task_records**: idemKey(userId taskId date dateStr evidence status)  

### 辅助集合

**generations**: generation(character branchId note)  
**branches**: name(ancestorId branchNo description status)  
**authorizations**: grantee(target grantedBy)  
**settings**: key(value description updatedBy)  
**auth_requests**: grantee(target targetName reason status reviewer reviewedAt comment)  
**audit_logs**: userId(action target detail time createdAt ip)  
**upload_metas**: scene(fileId size mimeType ownerOpenid visibility groupId)  
**worship_logs**: type(typeLabel targetMemberId userId message date)  
**chat_groups**, **media**, **documents** ...  

---

## 权限与索引

### 权限纪律

- **所有集合仅云函数可读写** (`wx.getDatabase()` only)
- 客户端禁止直接调用 `db.collection('xxx')`
- 审计日志 `audit_logs` append-only，禁止 update/delete

### 关键索引

| 集合 | 索引用途 |
|------|---------|
| members | `path` (前缀子树查询), `branchId+generation`, `linkedOpenid` |
| users | `openid`(唯一) |
| points_logs | `idemKey`(唯一幂等), `userId+time`(倒序分页) |
| plaza_posts | `publishAt`(倒序时间线), `authorId+publishAt` |
| notifications | `userId+read+createdAt`(个人未读筛选) |
| ceremonies/events | `status+date/type`(红白事/讣告筛选) |
| audit_logs | `action+time`(审计列表倒序), `userId+time` |

---

## 维护指南

### 字段变更流程

1. 修改 `.schema.json`
2. 运行 `schema-consistency-test.js` 检查代码引用一致性
3. Commit → Deploy 到云环境 (同步至现有集合需手动调整)

### 索引优化

- `orderBy` 字段必须有索引
- `where` + `skip/limit` 分页走复合索引 `(field1, field2)`
- 高频过滤字段 (status/read/notified) 建单列索引

### 验证门禁

```bash
npm run check:functions  # 云函数静态校验
node cloud/db-schemas/schema-consistency-test.js  # schema 引用检查
```

---
