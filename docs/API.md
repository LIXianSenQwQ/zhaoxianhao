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
