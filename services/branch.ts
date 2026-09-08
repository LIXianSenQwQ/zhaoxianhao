/**
 * services/branch.ts — 分支管理统一封装
 * 云函数：branch（B1 分支管理 MVP）
 *
 * actions（见 cloud/functions/branch/index.js）：
 *   list/tree   MEMBER+   —— 返回全部 ACTIVE 分支按 code 升序，前端组三级树
 *   detail      MEMBER+   —— 按 code 返回单个 + 直接子支
 *   stats       EDITOR+   —— 全族分支统计
 *   create      BRANCH_HEAD+ —— 生成 HAO- 层级序列码
 *   update      EDITOR+   —— 改非结构字段（描述/字辈诗/headUserId/population）
 *   archive     EDITOR+   —— 归档（总谱与含活跃子支的不可归档）
 *   seed        CHIEF+    —— 初始化总谱（幂等）
 */
import { call, write } from './request';

/** 分支数据（与 cloud/db-schemas/branches.schema.json 对齐） */
export interface Branch {
  _id?: string;
  code: string;          // HAO-0000 | HAO-0000-01 | HAO-0000-01-03
  name: string;          // 同父下唯一
  level: 1 | 2 | 3;      // 1 总谱 / 2 分谱 / 3 支谱
  parentCode: string | null;
  ancestorId?: string | null;
  founderGeneration?: number | null;
  region?: string;
  population?: number;
  generationVerses?: string;
  headUserId?: string | null;
  description?: string;
  sourceTags?: string[];
  confidence?: number;
  status: 'ACTIVE' | 'MERGED' | 'ARCHIVED';
  mergedInto?: string | null;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
  /** detail 附加 */
  children?: Branch[];
}

/** 全部分支（前端按 code 组三级树） */
export function listAll(limit = 500) {
  return call('branch', { action: 'list', limit }, 'branch_list', 30000);
}

/** 树视图（list 同源，语义便于前端组树） */
export function tree(limit = 500) {
  return call('branch', { action: 'tree', limit }, 'branch_tree', 30000);
}

/** 分支详情 + 直接子支 */
export function detail(code: string) {
  return call('branch', { action: 'detail', code }, `branch_detail_${code}`, 30000);
}

/** 全族分支统计（EDITOR+） */
export function stats() {
  return call('branch', { action: 'stats' }, 'branch_stats', 30000);
}

/** 创建分支（BRANCH_HEAD+） */
export function create(payload: {
  name: string;
  level: 2 | 3;
  parentCode?: string;   // level 2 缺省挂总谱 HAO-0000
  region?: string;
  description?: string;
  generationVerses?: string;
  ancestorId?: string;
  founderGeneration?: number;
}) {
  return write('branch', { action: 'create', ...payload }, 'branch', `create_${payload.name}`);
}

/** 更新非结构字段（EDITOR+） */
export function update(code: string, payload: Partial<Pick<Branch, 'description' | 'generationVerses' | 'population' | 'headUserId'>>) {
  return write('branch', { action: 'update', code, ...payload }, 'branch', `update_${code}`);
}

/** 归档（EDITOR+；总谱/含活跃子支不可归档） */
export function archive(code: string) {
  return write('branch', { action: 'archive', code }, 'branch', `archive_${code}`);
}

/** 初始化总谱（CHIEF+，幂等） */
export function seed() {
  return write('branch', { action: 'seed' }, 'branch', 'branch_seed');
}