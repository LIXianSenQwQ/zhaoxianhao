// utils/excel-parse.js
/**
 * CSV/Excel 解析工具（跨平台无依赖版）
 * R29 T1: 替代 parseExcelPlaceholder() mock
 * - CSV: 纯 JS 解析（引号/转义/BOM 处理）
 * - Excel: 保留 SheetJS 接入点（小程序端通过 CDN 或分包引入）
 */

/**
 * 解析 CSV 文本（支持引号包裹字段/BOM/空行）
 * @param {string} csvText
 * @returns {Promise<Array<Object>>} [{name, level, parentCode, region, description, generationVerses}]
 */
export function parseCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') throw new Error('CSV 内容为空');
  // 去 BOM
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV 需至少包含表头 + 1 行数据');

  // 解析单行（支持 "字段, 含逗号" 引号包裹）
  const splitLine = (line) => {
    const out = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (c === ',' && !inQuote) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const headers = splitLine(lines[0]).map(h => h.toLowerCase());
  const KEY_MAP = {
    'name': 'name', '名称': 'name',
    'level': 'level', '层级': 'level',
    'parentcode': 'parentCode', 'parent_code': 'parentCode', '父编码': 'parentCode',
    'region': 'region', '地域': 'region',
    'description': 'description', '描述': 'description',
    'generationverses': 'generationVerses', '字辈': 'generationVerses'
  };

  return lines.slice(1).map((line, idx) => {
    if (!line.trim()) return null;
    const values = splitLine(line);
    const row = { _row: idx + 2 }; // 记录原始行号（含表头行）
    headers.forEach((h, i) => {
      const key = KEY_MAP[h];
      if (key) row[key] = values[i] || '';
    });
    if (!row.name) return null; // 无名称的行跳过
    row.level = Number(row.level);
    return row;
  }).filter(Boolean);
}

/**
 * 解析 Excel 文件 (.xlsx/.xls)
 * @param {ArrayBuffer} fileData
 * @returns {Promise<Array<Object>>}
 */
export async function parseExcel(fileData) {
  // 小程序端动态 import 不可用，保留接入点说明
  // 生产方案：1) CDN 引入 full 版本 xlsx.full.min.js
  //          2) uni-app 分包异步加载
  //          3) 或云端解析（上传后由云函数处理）
  throw new Error('Excel 解析暂未开放：请先将文件另存为 CSV 格式后上传（R29 T1 占位，接入点已预留）');
}

/**
 * 生成 CSV 模板文本
 * @param {Array<Array<string>>} examples
 * @returns {string}
 */
export function generateTemplate(examples = []) {
  const lines = [
    'name,level,parentCode,region,description,generationVerses',
    ...examples.map(e => e.join(','))
  ];
  return lines.join('\n');
}
