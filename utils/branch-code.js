/**
 * utils/branch-code.js
 * 分支编码工具（纯函数，供页面/测试共用）
 *
 * 编码规则（框架 §3.2，评审决策点⑤）：
 *   总谱 HAO-0000
 *   二级谱 HAO-0000-01（分谱）
 *   三级谱 HAO-0000-01-03（支谱）
 *
 * 层级码天然唯一、自解释，region 字段承载中文地名。
 * seed code 蓝图原型 HAO-冀-赵县-宋村-001 暂缓，待族史委裁决。
 */

/** 层级命名 */
const LEVEL_LABELS = {
  1: '总谱',
  2: '分谱',
  3: '支谱',
};

/**
 * 解析 branch code → 结构化对象
 * @param {string} code - eg."HAO-0000-01-03"
 * @returns {{ prefix:string, segments:number[], level:number, label:string }|null}
 */
export function parseBranchCode(code) {
  if (!code || typeof code !== 'string') return null;
  const m = code.match(/^(HAO)-([0-9]{4}(?:-[0-9]{2})*)$/);
  if (!m) return null;
  const segments = m[2].split('-').map(Number);
  const level = segments.length; // HAO-0000 → length 1 → level 1
  return {
    prefix: m[1],
    segments,
    level,
    label: LEVEL_LABELS[level] || '未知层级',
  };
}

/**
 * 校验 branch code 格式
 * @param {string} code
 * @param {number} [maxLevel=3]
 * @returns {boolean}
 */
export function validateBranchCode(code, maxLevel = 3) {
  const p = parseBranchCode(code);
  return p !== null && p.level >= 1 && p.level <= maxLevel;
}

/**
 * 生成子支 code
 * @param {string} parentCode - 父分支 code
 * @param {number} seq - 兄弟序号（1-based）
 * @returns {string}
 */
export function formatBranchCode(parentCode, seq) {
  return `${parentCode}-${String(seq).padStart(2, '0')}`;
}

/**
 * 提取层级标签
 * @param {string} code
 * @returns {string}
 */
export function branchLevelLabel(code) {
  const p = parseBranchCode(code);
  return p ? p.label : '';
}