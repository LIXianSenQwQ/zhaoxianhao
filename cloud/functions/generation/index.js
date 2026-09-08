/**
 * cloud/functions/generation/index.js
 * 字辈管理（蓝图 §4.4 B2 冲刺）
 * 
 * actions:
 *   - getPoem: MEMBER+ → 返回全族字辈数组 + 元数据（总字数、是否用尽等）
 *   - setPoem: EDITOR+ → 保存新字辈序列（校验≤50 字）
 *   - matchGen: MEMBER+ → 输入世代数，返回对应字辈字
 *   - matchByYear: MEMBER+ → 输入出生年份，估算世代 + 字辈字
 *   - validateName: MEMBER+ → 校验谱名格式（姓 + 字辈 + 名）
 *   - checkDuplicate: MEMBER+ → 检查同世代重名冲突
 *   - alignCheck: MEMBER+ → 字辈对齐校验（框架§5.1：谱名字辈字与总谱字辈表实时比对）
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');
const ln = require('./common/lineage-naming.js'); // 使用 utils 模块时通过 npm sync 或本地拷贝

// ─── 门禁角色映射 ───
const CODE_SET_POEM_ROLE = 'EDITOR';
const MEMBER_PLUS_ROLE = 'MEMBER';

// ─── 工具 ───
function pickDoc(res) {
  const arr = res && res.data;
  if (Array.isArray(arr)) return arr.length ? arr[0] : null;
  return arr || null;
}

/** settings.generation_chars 读/写工具（复用 profile upsert 模式，避免双源） */
async function findGenerationSettings(db) {
  const res = await db.collection('settings').where({ key: 'generation_chars' }).limit(1).get();
  return pickDoc(res);
}

async function upsertGeneration(db, chars, currentOpenid) {
  // 类似 profile.updateFamilyInfo：select → update 或 add
  const res = await db.collection('settings').where({ key: 'generation_chars' }).limit(1).get();
  if (res.data.length > 0) {
    const item = res.data[0];
    await db.collection('settings').doc(item._id).update({
      data: { key: 'generation_chars', value: chars, updatedAt: new Date(), updatedBy: currentOpenid }
    });
  } else {
    await db.collection('settings').add({
      _id: 'generation_chars', key: 'generation_chars', value: chars, createdAt: new Date(), updatedAt: new Date(), updatedBy: currentOpenid
    });
  }
}

// ─── main dispatch ───
async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');

  const userRes = await wx.getDatabase().collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';

  const { action } = event || {};
  const db = wx.getDatabase();

  try {
    switch (action) {
      case 'getPoem': {
        // MEMBER+ 门禁 + 获取全族字辈
        if (!hasRole(role, MEMBER_PLUS_ROLE)) return FORBIDDEN('登录可见');
        const settings = await findGenerationSettings(db);
        const chars = (settings && settings.value) || [];
        const remaining = ln.MAX_GENERATION_CHARS - chars.length;
        return OK({
          chars,
          total: chars.length,
          remaining,
          canExtend: remaining >= 10,
          canEdit: hasRole(role, CODE_SET_POEM_ROLE),
          member: null
        });
      }

      case 'setPoem': {
        // EDITOR+ 门禁 + 参数校验
        if (!hasRole(role, CODE_SET_POEM_ROLE)) return FORBIDDEN('仅族史委可编辑字辈');
        
        const { poemStr } = event || {};
        if (!poemStr) return BAD_REQUEST('poemStr required');
        
        // normalize 并校验长度
        let chars;
        try {
          chars = ln.normalizePoem(poemStr);
        } catch (e) {
          return BAD_REQUEST(e.message);
        }
        
        // 复用 profile's generation_chars 存储（避免双源）
        await upsertGeneration(db, chars, openid);
        
        await writeAudit(db, {
          userId: openid,
          action: 'generation.poem.set',
          target: `${chars.length}字`,
          detail: JSON.stringify({ charsCount: chars.length })
        });
        
        return OK({ success: true, count: chars.length });
      }

      case 'matchGen': {
        // MEMBER+ 按世代匹配字辈
        if (!hasRole(role, MEMBER_PLUS_ROLE)) return FORBIDDEN('登录可见');
        const { generation } = event || {};
        if (!Number.isInteger(generation) || generation < 1) {
          return BAD_REQUEST('generation must be positive integer');
        }
        
        const settings = await findGenerationSettings(db);
        const chars = (settings && settings.value) || [];
        const result = ln.matchGenerationChar({ chars, generation });
        
        return OK({
          generation,
          character: result.char,
          valid: result.valid
        });
      }

      case 'matchByYear': {
        // MEMBER+ 按出生年份估算字辈
        if (!hasRole(role, MEMBER_PLUS_ROLE)) return FORBIDDEN('登录可见');
        const { baseYear, baseGen, birthYear, yearPerGen = 25 } = event || {};
        if (!Number.isFinite(baseYear) || !Number.isInteger(baseGen) || !Number.isFinite(birthYear)) {
          return BAD_REQUEST('baseYear/baseGen/birthYear required');
        }
        
        const settings = await findGenerationSettings(db);
        const chars = (settings && settings.value) || [];
        const result = ln.matchByBirthYear({ chars, baseYear, baseGen, birthYear, yearPerGen });
        
        return OK({
          estimatedGeneration: result.generation,
          character: result.char,
          valid: result.valid
        });
      }

      case 'validateName': {
        // MEMBER+ 校验谱名格式
        if (!hasRole(role, MEMBER_PLUS_ROLE)) return FORBIDDEN('登录可见');
        const { name, surname, generationChar } = event || {};
        if (!name || !surname) return BAD_REQUEST('name/surname required');
        
        const isValid = ln.validateGenealogyName({ name, surname, generationChar });
        
        return OK({ valid: isValid });
      }

      case 'checkDuplicate': {
        // MEMBER+ 检查同世代重名
        if (!hasRole(role, MEMBER_PLUS_ROLE)) return FORBIDDEN('登录可见');
        const { name, generation, existingNames } = event || {};
        if (!name || !Number.isInteger(generation) || !Array.isArray(existingNames)) {
          return BAD_REQUEST('name/generation/existingNames required');
        }
        
        const result = ln.checkDuplicateGenealogyName({ name, generation, existingNames });
        
        return OK(result);
      }

      case 'alignCheck': {
        // MEMBER+ 字辈对齐校验（框架§5.1：谱名字辈字与总谱字辈表实时校验）
        if (!hasRole(role, MEMBER_PLUS_ROLE)) return FORBIDDEN('登录可见');
        const { generation, genealogyName, surname = '郝', generationChar } = event || {};
        if (!Number.isInteger(generation) || generation < 1) {
          return BAD_REQUEST('generation required (正整数，自始祖起算)');
        }
        
        const settings = await findGenerationSettings(db);
        const chars = (settings && settings.value) || [];
        
        // 期望字辈字：字辈表该世代对应字
        const expected = ln.matchGenerationChar({ chars, generation });
        
        // 实际字辈字：显式传入优先；否则从谱名解析（谱名 = 姓 + 字辈 + 名 → 去姓后首字）
        let actual = generationChar || null;
        if (!actual && genealogyName && typeof genealogyName === 'string' && genealogyName.length > 0) {
          const body = genealogyName.startsWith(surname) ? genealogyName.slice(surname.length) : genealogyName;
          actual = body.charAt(0) || null;
        }
        
        // 未超字辈表时才判对齐；超出表长（续拟未定）返回 aligned=null 由族史委裁决
        let aligned = null;
        if (expected.valid) {
          aligned = Boolean(actual && expected.char === actual);
        }
        
        return OK({
          aligned,
          generation,
          expectedChar: expected.char,
          actualChar: actual,
          charsTotal: chars.length,
          beyondPoem: !expected.valid,
          note: !expected.valid ? '世代超出字辈表长度，续拟流程待族议会审批（框架§4.4）' : undefined
        });
      }

      default:
        return BAD_REQUEST(`unknown action: ${action}`);
    }
  } catch (e) {
    console.error('[generation.main] error:', e);
    return BAD_REQUEST(e.message);
  }
}

module.exports = { main };
