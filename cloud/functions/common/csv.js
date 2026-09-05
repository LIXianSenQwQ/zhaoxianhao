/**
 * cloud/functions/common/csv.js
 * CSV 导出纯函数（Sprint R5）
 * 
 * 职责：UTF-8 BOM + CSV 转义 + 行转 CSV 文本；可单测零依赖
 * 云函数引用：member.export / admin.export
 */

/** UTF-8 BOM 字节序标记 → CSV 头部必须添加 */
const BOM = '\ufeff';

/** 字段级 CSV 转义：包含逗号/引号/换行时双引号包裹，内部引号成对双写 */
function escapeField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const needsQuotes = /[,"\n\r]/.test(str);
  if (!needsQuotes) return str;
  // 双写引号转义
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/** row 数组 → CSV 行字符串 */
function rowToCsvLine(fields) {
  return fields.map(escapeField).join(',');
}

/** rows[{key:v}] → CSV 文本（含表头）*/
function rowsToCsv(rows, keys) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const headers = Array.isArray(keys) ? keys : Object.keys(rows[0]);
  const lines = [rowToCsvLine(headers)];
  for (const r of rows) {
    lines.push(rowToCsvLine(headers.map(k => r[k])));
  }
  return BOM + lines.join('\r\n');
}

module.exports = { BOM, escapeField, rowToCsvLine, rowsToCsv };
