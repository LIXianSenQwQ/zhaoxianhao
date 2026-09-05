/**
 * cloud/functions/common/kindship.js
 * 称谓矩阵 + 五服判定（纯函数，文档 7.2 / 7.3）
 * 口径唯一：称谓与五服由 relations 实时计算、不落库（文档 5.3）
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
 * 称谓矩阵（正式称谓，n=上溯代数, m=下溯代数, 同辈长幼, 性别）
 * 键约定：`${n}-${m}`，同辈时用 seniority 区分
 * 矩阵为内置兜底版；方言称谓由 settings 集合覆盖（文档 7.2 第 5 条）
 */
const MATRIX = Object.freeze({
  // 同辈 n=0,m=0
  '0-0': {
    sameGender: { elder: '兄/姐', younger: '弟/妹' },
    male: { elder: '哥哥', younger: '弟弟' },
    female: { elder: '姐姐', younger: '妹妹' }
  },
  // 直系上溯
  '1-0': { male: '父亲', female: '母亲' },
  '2-0': { male: '祖父', female: '祖母' },
  '3-0': { male: '曾祖父', female: '曾祖母' },
  '4-0': { male: '高祖父', female: '高祖母' },
  // 直系下溯
  '0-1': { male: '儿子', female: '女儿' },
  '0-2': { male: '孙子', female: '孙女' },
  '0-3': { male: '曾孙', female: '曾孙女' },
  // 旁系：父辈 (n=1 上溯, m=1 下溯 → 叔伯/姑)
  '1-1': {
    male: { elder: '伯父/叔叔', younger: '侄子' },
    female: { elder: '姑母', younger: '侄女' }
  },
  // 祖父辈旁系 (n=2, m=1 → 舅/姨 等按母系，此处宗法默认父系)
  '2-1': {
    male: { elder: '堂伯/堂叔', younger: '堂侄' },
    female: { elder: '堂姑', younger: '堂侄女' }
  },
  // 子辈旁系 (n=1 上溯到父母再下溯 2 代)
  '1-2': { male: '孙辈(兄弟之孙)', female: '孙辈(姐妹之孙女)' }
});

/**
 * kinshipTitle - 查正式称谓
 * @param {number} n  本人→共同祖先 上溯代数
 * @param {number} m  共同祖先→对方   下溯代数
 * @param {'MALE'|'FEMALE'} gender 对方性别
 * @param {'elder'|'younger'|null} seniority 同辈长幼（非同辈传 null）
 * @returns {string}
 */
function kinshipTitle(n, m, gender, seniority) {
  const key = `${n}-${m}`;
  const node = MATRIX[key];
  if (!node) return '族亲';

  if (n === 0 && m === 0) {
    // 同辈
    const g = gender === 'MALE' ? 'male' : 'female';
    if (node[g] && seniority) return node[g][seniority] || '族亲';
    if (seniority && node.sameGender) return node.sameGender[seniority] || '族亲';
    return '族亲';
  }

  const g = gender === 'MALE' ? 'male' : 'female';
  const val = node[g];
  if (typeof val === 'string') return val;
  if (val && seniority) return val[seniority] || '族亲';
  return '族亲';
}

module.exports = { fiveFu, kinshipTitle, MATRIX };
