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

---
