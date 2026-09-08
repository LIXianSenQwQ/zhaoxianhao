/**
 * services/generation.ts — 字辈管理统一封装
 * 云函数：generation（B2 字辈与谱名）
 * 
 * actions:
 *   getPoem        MEMBER+   —— 获取全族字辈数组 + 元数据
 *   setPoem        EDITOR+   —— 保存新字辈序列（≤50 字校验）
 *   matchGen       MEMBER+   —— 按世代索引匹配字辈
 *   matchByYear    MEMBER+   —— 按出生年份估算字辈
 *   validateName   MEMBER+   —— 校验谱名格式（姓 + 字辈 + 名）
 *   checkDuplicate MEMBER+   —— 检查同世代重名冲突
 */
import { call, write } from './request';

/** 字辈数据（settings.generation_chars value[]） */
export interface GenerationData {
  chars: string[];          // 字辈字符数组
  total: number;            // 总字数
  remaining: number;        // 剩余可用字数
  canExtend: boolean;       // 是否需要续拟审批
  canEdit: boolean;         // 当前用户是否可编辑
  member?: any | null;      // 绑定成员信息（可选）
}

/** 匹配结果（世代→字辈） */
export interface MatchResult {
  generation?: number | null;
  estimatedGeneration?: number | null;
  character: string | null;
  valid: boolean;
}

/** 谱名校验结果 */
export interface NameValidation {
  valid: boolean;
}

/** 重复检测结果 */
export interface DuplicateCheck {
  isDuplicate: boolean;
  conflictLevel: 'duplicate' | 'none';
}

// ─── 读操作（带缓存） ───

/** 获取全族字辈 */
export function getPoem() {
  return call('generation', { action: 'getPoem' }, 'generation_poem', 60000);
}

/** 按世代匹配字辈 */
export function matchGen(generation: number) {
  if (!Number.isInteger(generation) || generation < 1) {
    throw new Error('generation must be positive integer');
  }
  return call('generation', { action: 'matchGen', generation }, `generation_match_${generation}`, 30000);
}

/** 按出生年份估算字辈 */
export function matchByYear(baseYear: number, baseGen: number, birthYear: number, yearPerGen = 25) {
  if (!Number.isFinite(baseYear) || !Number.isInteger(baseGen) || !Number.isFinite(birthYear)) {
    throw new Error('baseYear/baseGen/birthYear required');
  }
  const cacheKey = `generation_byyear_${baseYear}_${baseGen}_${birthYear}`;
  return call('generation', { action: 'matchByYear', baseYear, baseGen, birthYear, yearPerGen }, cacheKey, 30000);
}

/** 校验谱名格式 */
export function validateName(name: string, surname: string, generationChar: string) {
  if (!name || !surname) throw new Error('name/surname required');
  return call('generation', { action: 'validateName', name, surname, generationChar }, `gen_validate_${name}`, 30000);
}

/** 检查重复名 */
export function checkDuplicate(name: string, generation: number, existingNames: string[]) {
  if (!name || !Number.isInteger(generation) || !Array.isArray(existingNames)) {
    throw new Error('name/generation/existingNames required');
  }
  return call('generation', { action: 'checkDuplicate', name, generation, existingNames }, `gen_dup_${name}_${generation}`, 30000);
}

// ─── 写操作（带幂等） ───

/** 保存字辈（EDITOR+；幂等键为 bizType:generation:setPoem） */
export function setPoem(poemStr: string) {
  if (!poemStr || typeof poemStr !== 'string') {
    throw new Error('poemStr required');
  }
  return write(
    'generation',
    { action: 'setPoem', poemStr },
    'generation',
    `setPoem_${Date.now()}`
  );
}
