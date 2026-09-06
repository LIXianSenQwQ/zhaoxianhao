# API 参考（好诚事家风 · Sprint R4）

> 本文档按双周迭代更新（R1 → R4），记录云函数 `main(params)` 统一响应格式与业务参数。
> **统一响应**：`{ success: boolean, data?: any, code?: number, message?: string }`；写操作返回 `data._id`。

---

## 1. 成员（member）

### 1.1 tree（族谱树前缀查询，Sprint R2/R4）

**请求**：`{ action: 'tree', focusId: string, page: number }`

- `focusId`: 聚焦路径节点（如 `/001/003/`），必传；若缺参返回 BAD_REQUEST
- `page`: 分页序号（≥1），默认 1

**响应**：
```json
{
  "success": true,
  "data": {
    "nodes": [{ _id, name, genealogyName, generation, branchId, path, gender? }],
    "cursor": "abc123", // 游标（下次页用）
    "hasMore": false
  }
}
```

**备注**：使用 `members.path` 前缀索引；一次查询 ≤200 节点预算；子树懒加载由前端调用本 action（focusId 为父 path）。

### 1.2 list（成员列表筛选）

**请求**：`{ action: 'list', branch?: string, page: number }`

- `branch`: 房支过滤（可选）
- `page`: 分页序号

**响应**：同上

### 1.3 getDetail（详情）

**请求**：`{ action: 'getDetail', memberId: string }`

- 若成员不存在 → NOT_FOUND 404
- 隐私卡路由字段：`needAuthCard`, `applyRoute`

### 1.4 export（批量导出 CSV，Sprint R5）

**请求**：`{ action: 'export', branchId?: string, page?: number }`

**权限**：仅 `CHIEF` 可执行

- 单批上限 500 行（`EXPORT_BATCH`，内存峰值保护）
- 字段投影仅导出非私密字段（谱名/本名/世代/房支/性别/生卒/状态/世系路径）
- 排序：`path ASC`（物化路径序 = 族谱序）
- CSV 含 UTF-8 BOM（Excel 打开不乱码）；逗号/引号/换行自动转义

**响应**：
```json
{
  "success": true,
  "data": {
    "csv": "\ufeff谱名,世代\r\n郝一,18\r\n...",
    "total": 500,
    "page": 1,
    "hasMore": true
  }
}
```

**前端**：tree.vue 工具栏"导出 CSV"按钮（`user.isChief` 才显示），`uni.setClipboardData` 复制到剪贴板。

### 1.5 exportFile（全量导出→云存储落盘，Sprint R7）

**请求**：`{ action: 'exportFile', branchId?: string }`

**权限**：仅 `CHIEF` 可执行

- 全量分批拉取（单批 500 × 最多 10 批 = 5000 行上限）
- CSV → `wx.cloud.uploadFile`（路径 `exports/members-{branch}-{ts}.csv`）→ `getTempFileURL` 取下载链接
- 上传失败返回 500（R8 评估降级为剪贴板回退）

**响应**：`{ success: true, data: { fileID, fileURL, total, cloudPath } }`

### 1.6 applyAuth（授权申请，Sprint R7）

**请求**：`{ action: 'applyAuth', memberId: string, reason: string }`

**权限**：`MEMBER+`（鉴权先行：VISITOR 直接 403，不暴露参数校验细节）

- reason 长度 5–500 字
- 幂等：同一申请人对同一目标已有 PENDING 申请时返回 `{ duplicate: true }`
- 写入 `auth_requests`（grantee/target/reason/status=PENDING）+ audit_log 审计

**响应**：`{ success: true, data: { submitted: true } }`

**前端**：detail.vue 的 PrivacyCard 点击 → `/pages/privacy/privacy?memberId=&name=` 申请表单页。

### 1.7 reviewAuth（授权审批，Sprint R8/R9）

**请求**：`{ action: 'reviewAuth', op: 'list' | 'approve' | 'reject', requestId?: string, comment?: string, status?: string, grantee?: string, target?: string, filterPage?: number }`

**权限**：仅 `CHIEF`

- `op=list`（Sprint R9 筛选+分页）：
  - `status`：`PENDING`（默认）/ `APPROVED` / `REJECTED`，白名单校验，非法值 400
  - `grantee` / `target`：可选过滤
  - `filterPage`：页码（默认 1，每页 50 条）
  - 响应：`{ requests, page, hasMore }`
- `op=approve`：requestId 必传；幂等保护（非 PENDING 返回 400）；批准后 **upsert 检查** `authorizations` 中 grantee+target 是否已存在（存在→skip 写入并审计 upsert_skip；不存在→写入）+ audit_log
- `op=reject`：requestId 必传；同幂等保护

**前端**：`/pkg-growth/pages/reviewAuth/reviewAuth.vue` 审批工作台（三态 Tab：待审/已批准/已驳回 + 加载更多）。

### 1.8 getDetail（成员详情，Sprint R9 字段级提示增强）

**响应新增**：`{ member: view, hiddenFields: string[] }`——被隐私分级隐藏的字段名数组（该字段在原始数据中存在但当前用户无权查看）。

**前端**：detail.vue 渲染"受限信息"卡（模糊遮挡 ████ + "申请授权查看 N 项受限字段"按钮 → 授权申请页）。

---

## 2. 入谱（entry）

### 2.1 submit（提交入谱申请，幂等）

**请求**：`{ action: 'submit', type: 'OCR'|'EXCEL'|'MANUAL', payload: { name, generation, branchId, fatherId?, ... } }`

- `type`: 来源（OCR/Excel/人工）
- `payload.name` / `generation` / `branchId`: 必填；其他扩展字段可选
- 幂等键生成规则：`entry.submit: ${branchId}:${generation}:${name}` + `userId`；重复提交返回既有单号

**响应**：`{ success: true, recordId: string, genealogyName: string }`

### 2.2 audit（双人审核链）

**请求**：`{ action: 'audit', recordId: string, auditAction: 'FIRST_PASS'|'SECOND_PASS'|'REJECT', comment?: string }`

**权限**：仅 `HISTORIAN` 角色可执行

- **FIRST_PASS**: 初审通过，要求 ≠ 提交人
- **SECOND_PASS**: 复审触发入库（`finalizeApprovedMember`），要求 ≠ FIRST_PASS 且 ≠ 提交人
- **REJECT**: 驳回工单

**响应**：`{ success: true, status: 'FIRST_PASS'|'APPROVED'|'REJECTED', memberId?: string }`

### 2.3 importExcel（批量导入，Sprint R3）

**请求**：`{ action: 'importExcel', payload: { rows: [{ name, generation, branchId, fatherName? }, ...] } }`

**权限**：仅 `EDITOR+` 可执行

- 客户端解析 Excel 后传入 JSON rows
- 行级校验报告：`valid` / `invalid[]` / `draftIds[]`
- 有效行生成草稿工单（状态 `SUBMITTED` 走双人审核）

**响应**：`{ success: true, valid, invalid[], draftIds[] }`

### 2.4 list（工单列表）

**请求**：`{ action: 'list', status?: 'SUBMITTED'|'FIRST_PASS'|'APPROVED'|'REJECTED', page?: number }`

**响应**：`{ success: true, records: [entry_record], hasMore? }`

---

## 3. 文档（doc）

### 3.1 list（文档列表）

**请求**：`{ action: 'list', type?: 'old_genealogy'|'photo'|'stele'|'document', era?: string, page?: number }`

- `type`: 文档类型（选填），未知类型 → BAD_REQUEST 400
- 排序：`createdAt DESC`，limit=50，分页

**响应**：`{ success: true, docs: [...], page, hasMore }`

### 3.2 search（OCR 全文检索）

**请求**：`{ action: 'search', keyword: string, page?: number }`

- 正则转义 + 大小写不敏感
- 标题优先命中 → 合并去重

**响应**：同 list

### 3.3 upload（贡献登记）

**请求**：`{ action: 'upload', title, type, era?, fileId, thumbUrl?, level='L2', ocrText='', size=0 }`

**权限**：仅 `MEMBER+`

- `fileId`: 先走 `upload.policy` 直传云存储获取
- `ocrText`: 上限 20000 字符

**响应**：`{ success: true, docId: string }`

### 3.4 get（详情，隐藏 OCR 大字段）

**请求**：`{ action: 'get', docId: string }`

- 若不存在 → NOT_FOUND 404
- `doc.ocrText` 字段剔除（如需则独立 action 拉取）

---

## 4. 通知（notify）

### 4.1 digest（首页摘要）

**请求**：`{ action: 'digest' }`

**响应**：`{ success: true, cards: [{ type, title, desc, date, id? }] }`

### 4.2 list（我的通知）

**请求**：`{ action: 'list', page?: number }`

**响应**：`{ success: true, records: [...], hasMore, page }`

### 4.3 broadcast（紧急广播）

**请求**：`{ action: 'broadcast', content: string, level?: 'HIGH'|'MEDIUM' }`

**权限**：仅 `EDITOR+`

**响应**：`{ success: true, broadcastId, notifiedCount }`

---

## 5. 挂接校验（linkage.js）

> 内部纯函数，非独立云函数；入口：`entry.finalizeApprovedMember`, `entry.importExcel`

### validateLink

**请求**：`{ child: { generation, branchId, name? }, parent?: { path, generation, branchId }, opts: { memberNo, allowCrossBranch? } }`

**响应**：`{ ok: boolean, reasons: string[], path?: string }`

- 世代互指失败 → 拒绝
- 跨支 → 拒绝（`allowCrossBranch=true` 豁免）

---

## 6. 响应码统一口径

| Code | Message           | 说明                          |
|-----:|-------------------|-------------------------------|
| 400  | Bad Request       | 参数校验失败                  |
| 403  | Forbidden         | 未授权 / 无权限               |
| 404  | Not Found         | 资源不存在                    |
| 408  | Request Timeout   | 读路径可重试（1s/2s/4s...）   |
| 500  | Server Error      | 服务端错误，可重试            |
| 502  | Bad Gateway       | 可重试                        |
| 503  | Service Unavailable | 可重试                      |

---

## 7. 分页策略

- `limit=20`（成员列表）或 `limit=50`（文档列表）
- 前端 `page` 自增，后端无需 cursor（简单场景）

---

## 8. Sprint R11 新增/修复（V2.0 蓝图对齐）

### 8.1 admin.auditList（审计流水查询 · R11 鉴权修复）

**请求**：`{ action: 'auditList', userId?, action?, startDate?, endDate?, filterPage? }`

- **权限**：HISTORIAN 及以上（R11 修复：此前任何登录者可查——越权漏洞已封堵）
- `startDate/endDate`: ISO 日期字符串；服务端转 `db.command.gte/lte`（R11 修复：`$gte` 字符串操作符在云开发不生效）
- `filterPage`: 分页序号，默认 1，页大小 50

**响应**：
```json
{
  "success": true,
  "data": { "logs": [{ userId, action, target, detail, ip, sensitive, time }], "page": 1, "hasMore": false }
}
```

### 8.2 plaza（家族广场 · R11 新建云函数）

| action | 入参 | 权限 | 说明 |
|---|---|---|---|
| `list` | `filterPage?`, `type?` | MEMBER+ | 分页 20/页，publishAt 倒序 |
| `publish` | `type?`(text/image/video/mixed), `content`, `mediaIds?`(≤9) | MEMBER+ | 文字 ≤5000（蓝图 C.3）；审计 `plaza.publish` |
| `like` | `postId` | MEMBER+ | 原子 +1（`db.command.inc`），返回真实值 |

- 内容安全检测接入点预留（V2.0 secscan，F4 交付）
- V2.0 moment 迁移路径：plaza_posts → family_moments（幂等脚本，蓝图 C.1）

### 8.3 relation.calc（称谓计算 · R11 重写）

**修复**：旧版 calc 引用未定义函数（`findShortestPath` 等）→ 调用即 ReferenceError；本版改用**物化路径前缀交集**（O(1)，R2 方案）+ `common/kindship` 纯函数（与单测同源）。

**请求**：`{ action: 'calc', aId, bId }` · **权限**：MEMBER+（蓝图 9.1 L2）

**响应**：
```json
{
  "success": true,
  "data": {
    "related": true,
    "formalTitle": "哥哥",
    "fiveFu": "斩衰",
    "upSteps": 1, "downSteps": 1,
    "path": "/001/003/"
  }
}
```

- 无共同祖先 → `{ related: false, formalTitle: '同宗', fiveFu: '同宗' }`（fail-closed）
- `relation.edit` 引导走入谱工作流 `entry.submit(type=CHANGE)`（双人审核链）

### 8.4 审计字段口径统一（R11）

- 全部审计写入统一走 `common/audit.js writeAudit`：集合 **audit_logs**（蓝图 5.6 定案），字段 `{userId, action, target, detail, ip, sensitive, time}`
- R11 修复集合名分裂：member 内联 `audit_log`（单数）→ `audit_logs`；member.writeExportAudit 改为 writeAudit 薄封装（补 time/target 字段）
- admin.featureFlag 变更写审计 `admin.featureFlag`（此前裸写 audit_logs 无统一字段）

### 8.5 points 大修（R12 · 蓝图 7.5/9.1 对齐）

| action | 入参 | 权限 | 说明 |
|---|---|---|---|
| `get` | — | 登录 | 四池余额（无账户自动创建归零并返回） |
| `list` | `filterPage?` | 登录 | 本人流水 20/页，time 倒序（新增） |
| `award` | `pool`(四池白名单), `bizType`, `bizId`, `targetUserId?` | **EDITOR+**（R12 封堵自刷漏洞） | 幂等键 **bizType+bizId**（蓝图 7.5）；重复返回 `duplicated:true` 不重复加分；写审计 |

- **R12 修复**：`_.inc` 未定义（必崩）→ `db.command.inc`；`wx.cloud.generateObjectId` 不存在 → add 自动 _id；getPoints 无账户返回 undefined；新建账户未接住 _id
- 幂等口径：流水先插（bizType+bizId 唯一）→ 账户原子更新；重复直接返回已有结果（蓝图 7.5 定案）
- 真机接入点：云开发事务（db.startTransaction）包住流水+余额写

---

### 8.6 ceremony 大修 + atmosphere 氛围引擎（R13 · 蓝图 9.1/11/7.8/7.9 对齐）

#### ceremony（祭祀礼拜 · R13 重写，此前遗留桩不可运行）

| action | 入参 | 出参 | 权限 | 说明 |
|---|---|---|---|---|
| worship | type, targetMemberId, message? | `{logId, type, typeLabel, worshipCount, blessing}` | MEMBER+ | type 白名单 `lamp/incense/flower/group`；灵位仅限 DECEASED（在世 400/缺失 404）；message ≤100 字；祭记每次落库，功德池 +10 幂等键 `ceremony.worship:type:灵位:YYYYMMDD`（同日同灵位同类型仅 1 次）；计数原子 +1；审计 ceremony.worship |
| spirits | page? | `{spirits[{id,name,generation,deathDate,worshipCount}], page, hasMore}` | MEMBER+ | 已故族人性列表 20/页（蓝图 shrine/index 灵位列表） |
| list | targetMemberId?, page? | `{logs[], page, hasMore}` | MEMBER+ | 祭记分页 20/页 date 倒序，可按灵位过滤 |
| remindScan | —（定时触发） | `{total, items[]}` | 系统 | 扫 `calendar_items{type:'忌日', notified:false, remindAt≤now}` → 写 notifications 站内通知（蓝图 7.9）+ 标记 notified 防重发 |

#### atmosphere（节气氛围引擎 · R13 重写，today 此前必崩）

| action | 入参 | 出参 | 权限 | 说明 |
|---|---|---|---|---|
| today | — | `{solarTerm, season, moodTheme{top,mid,bottom}, greeting, muted, festival, homeCards[]}` | 公开（蓝图 9.1） | 内置 24 节气年度近似表（模块导出 SOLAR_TERMS/resolveTerm 供年检校准）；圆环匹配跨年回卷冬至段；moodTheme 四季端点色（0.2.2 晨光渐变），白事静默（events 有 ACTIVE 讣告）→ 素色端点 + muted=true（7.8）；homeCards 占位 R14 接 digest |

#### common/points（系统积分发放公共模块 · R13 新建）

`awardSystemPoints(db, {userId, pool, bizType, bizId, amount, note})` → `{duplicated, logId, delta, pool}`
- 流水先行（幂等键 bizType+bizId+userId）→ 账户四池 `db.command.inc` 原子更新（蓝图 7.5）
- ceremony.worship（gongde）与 task.checkin（normal）共用；禁止系统内 callFunction 回环 points.award（该入口已收口 EDITOR 代发门禁）

#### task.checkin（R13 联动修复）

打卡响应新增 `points` 字段（awardSystemPoints 结果）；积分失败不阻塞打卡本体（console.warn + 审计兜底，补偿扫描按 dateStr）。

### 8.7 notify 大修 + atmosphere.homeCards 真数据（R14 · 蓝图 0.3.2/0.6.3/7.9 对齐）

#### notify（R14 四处缺陷清零）

| action | 入参 | 出参 | 权限 | 说明 |
|---|---|---|---|---|
| digest | — | `{cards[]}` | 登录 | 首页要事卡流（common/homecards 单一实现）：仪式(朱砂 accent)→个人提醒→个人未读通知→动态摘要→祖训今日兜底（settings.daily_motto 可配）；蓝图 0.3.2 权重排序 |
| list | page? | `{records[], page, hasMore}` | 登录 | 个人通知（userId=openid，含已读）+ 全员广播（scope:ALL 未读）合并 createdAt 倒序；**旧版仅查广播导致个人通知永不可见已修复** |
| markRead | notificationId | `{marked}` | 本人 | **水平越权封堵**：个人通知仅本人可标记（他人 403）+ readAt 留痕；广播为共享已读态（V1.1 per-user 回执） |
| broadcast | content, level | `{broadcastId, notifiedCount}` | EDITOR+ | `wx.cloud.generateObjectId` 移除（必崩点第三处清零）；订阅消息未配置跳过不阻塞；审计 notify.broadcast |

#### common/homecards（R14 新建）

`buildHomeCards(db, openid)` → 卡片 `{type, accent?, id, title, desc, date?}`
- type 枚举：`ceremony / reminder / notice / moment / motto`；ceremony 带 `accent:'cinnabar'`（前端朱砂边条）
- notify.digest 与 atmosphere.today.homeCards **共用同一实现**（蓝图 0.6.3 首页聚合口径唯一）；全子查询容错跳过，匿名→祖训兜底

#### atmosphere.today（R14 增量）

- `homeCards` 从空占位 → 真数据（携带 openid 四级卡流；匿名祖训兜底卡）
- 响应字段不变：`{solarTerm, season, moodTheme, greeting, muted, festival, homeCards}`

#### 前端路由失配修复（R14）

- index.vue 快捷条路由对齐 pages.json 注册页（shrine/tree/task 三处）+ `muted` 字段对齐；openCard 按卡类型分流（ceremony/notice→日历、moment→广场、motto→提示）
