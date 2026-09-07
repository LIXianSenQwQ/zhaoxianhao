/**
 * cloud/functions/common/kindship.js
 * 称谓矩阵 + 五服判定（纯函数，文档 7.2 / 7.3）
 * 口径唯一：称谓与五服由 relations 实时计算、不落库（文档 5.3）
 *
 * Sprint R2 修正（单测发现的 W1 缺陷）：
 * 矩阵键 (n,m) 采用文档语义「先上 n 步到最近共同祖先，再下 m 步到对方」：
 *   兄弟=(1,1) 经父 | 父母=(1,0) | 子女=(0,1) | 侄=(1,2) | 叔伯=(2,1) | 堂兄弟=(2,2)
 * 对方世代 = myGen - n + m；(n,m) 与 tree.relationSteps 直接连通。
 */

/** 五服判定：n = 共同祖先与本人的世代距离 */
function fiveFu(n) {
  if (!Number.isInteger(n) || n < 0) return '同宗';
  if (n <= 1) return '斩衰';
  if (n <= 2) return '齐衰';
  if (n <= 3) return '大功';
  if (n <= 4) return '小功';
  if (n <= 5) return '缌麻';
  return '同宗'; // 出五服
}

/**
 * 称谓矩阵（正式称谓内置兜底版；方言称谓由 settings 集合覆盖，文档 7.2 第 5 条）
 * 键 `${n}-${m}`；seniority 仅在"几何上长辈晚辈二选一"的槽位使用
 */
const MATRIX = Object.freeze({
  // 直系上溯 (n, 0)
  '1-0': { male: '父亲', female: '母亲' },
  '2-0': { male: '祖父', female: '祖母' },
  '3-0': { male: '曾祖父', female: '曾祖母' },
  '4-0': { male: '高祖父', female: '高祖母' },
  // 直系下溯 (0, m)
  '0-1': { male: '儿子', female: '女儿' },
  '0-2': { male: '孙子', female: '孙女' },
  '0-3': { male: '曾孙', female: '曾孙女' },
  // 同辈经父 (1,1)：兄弟姊妹
  '1-1': {
    sameGender: { elder: '兄/姐', younger: '弟/妹' },
    male: { elder: '哥哥', younger: '弟弟' },
    female: { elder: '姐姐', younger: '妹妹' }
  },
  // (1,2)：对方低我一代，经我父我弟 → 侄辈
  '1-2': { male: '侄子', female: '侄女' },
  // (2,1)：对方高我一代，经我祖我父 → 叔伯姑
  '2-1': { male: '伯父/叔叔', female: '姑母' },
  // (2,2)：对方与我同代，经祖父 → 堂亲
  '2-2': {
    sameGender: { elder: '堂兄/堂姐', younger: '堂弟/堂妹' },
    male: { elder: '堂兄', younger: '堂弟' },
    female: { elder: '堂姐', younger: '堂妹' }
  },
  // (1,3)：对方低我两代，经我父我弟 → 族孙（兄弟之孙）
  '1-3': { male: '族侄孙', female: '族侄孙女' },
  // (3,1)：对方高我两代，经曾祖祖父 → 堂伯祖辈
  '3-1': { male: '堂伯祖父', female: '堂姑祖母' }
});

/**
 * kinshipTitle - 查正式称谓（方言可叠加）
 * @param {number} n  本人→最近共同祖先 上溯步数
 * @param {number} m  共同祖先→对方   下溯步数
 * @param {'MALE'|'FEMALE'} gender 对方性别
 * @param {'elder'|'younger'|null} seniority 长幼（同代二选一槽位用）
 * @param {object=} dialect - optional 方言覆盖表，键 n-m 映射 {male:{elder/younger?}|female:{elder/younger?}|sameGender:{elder/younger?}}
 * @returns {{ formal:string, dialect?:string|null }}
 */
function kinshipTitle(n, m, gender, seniority, dialect) {
  if (n === 0 && m === 0) return { formal: '本人', dialect: null };
  
  const key = `${n}-${m}`;
  const node = MATRIX[key];
  if (!node) return { formal: '族亲', dialect: null };

  // 尝试从方言覆盖表取词（若存在则返回，否则 fallback formal）
  let dval = null;
  if (dialect && dialect[key]) {
    const dk = dialect[key];
    const g = gender === 'MALE' ? 'male' : 'female';
    // 优先按 gender+seniority 匹配，若无 seniority 或该组合不存在，退到 gender
    if (dk[g] && seniority && dk[g][seniority]) {
      dval = dk[g][seniority];
    } else if (dk[g]) {
      dval = dk[g];
    } else if (dk.sameGender && seniority) {
      dval = dk.sameGender[seniority];
    }
  }
  const dia = dval || null;

  const g = gender === 'MALE' ? 'male' : 'female';
  const val = node[g];
  let fmt = '族亲';
  if (typeof val === 'string') {
    fmt = val;
  } else if (val && seniority) {
    fmt = val[seniority] || '族亲';
  } else if (node.sameGender && seniority) {
    fmt = node.sameGender[seniority] || '族亲';
  }

  return { formal: fmt, dialect: dia };
}

module.exports = { fiveFu, kinshipTitle, MATRIX };
