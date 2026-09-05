/**
 * cloud/functions/relation/index.js
 * MVP Core: 称谓计算与五服判定
 * 算法：双向 BFS 路径 + 称谓矩阵表
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function main(params, context) {
  const { action, aId, bId } = params;
  
  if (action === 'calc') {
    return await calcRelation(aId, bId);
  }
  
  if (action === 'edit') {
    // L4 权限关系编辑（双人审核）
    return await editRelationship(params, context);
  }
}

async function calcRelation(aId, bId) {
  const db = wx.getDatabase();
  
  // Step 1: 查找共同祖先（双向 BFS）
  const path = await findShortestPath(aId, bId);
  if (!path) return { error: 'No relation found' };
  
  // Step 2: 拆解路径为 (a→祖先)+(祖先→b)
  const commonAncestor = path.split('->')[Math.floor(path.length/2)];
  const n = countGenerationsToAncestor(aId, commonAncestor); // a 上溯代数
  const m = countGenerationsFromAncestor(commonAncestor, bId); // 祖先下溯代数
  
  // Step 3: 查称谓矩阵表
  const matrix = getKinshipMatrix(n, m);
  const genderA = await getGender(aId);
  const genderB = await getGender(bId);
  
  return {
    formalTitle: matrix[genderA]?.[genderB] || '族亲',
    fiveFu: calculateFiveFu(n),
    path: path
  };
}

function getKinshipMatrix(n, m) {
  // 称谓矩阵表（示例简化版，实际需完整定义）
  return {
    MALE: { 
      MALE: { [1]: '兄弟', [2]: '叔伯', [3]: '侄子', [4]: '堂侄' },
      FEMALE: { [1]: '姐妹', [2]: '姑姑', [3]: '侄女', [4]: '堂侄女' }
    },
    FEMALE: {
      MALE: { [1]: '兄弟', [2]: '舅舅', [3]: '外甥', [4]: '堂外甥' },
      FEMALE: { [1]: '姐妹', [2]: '姨母', [3]: '外甥女', [4]: '堂外甥女' }
    }
  };
}

function calculateFiveFu(n) {
  if (n <= 1) return '斩衰';
  if (n <= 2) return '齐衰';
  if (n <= 3) return '大功';
  if (n <= 4) return '小功';
  if (n <= 5) return '缌麻';
  return '同宗';
}

module.exports = { main };
