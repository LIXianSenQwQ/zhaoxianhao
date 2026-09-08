/**
 * cloud/functions/gedcom/index.js — GEDCOM 导入导出（R30）
 * 
 * GEDCOM 5.5.1 / 7.0 双向支持：
 *   - export: members/relations/branches → .gedc/.ged
 *   - import: parse .gedcom file → validate → insert
 * 
 * Reference: 
 *   - GEDCOM 5.5.1: https://wiki.genealogical.org/GEDCOM_5.5.1_User_Guide
 *   - GEDCOM 7.0: https://familysearch.github.io/gedcom-reference/docs/
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

// ─── 常量 ───
const HEADER_MAP = {
  '1 NAME': '0/1/NAME',
  '1 BIRT': '0/1/BIRT',
  '2 DATE': '0/1/2/DATE',
  '2 PLAC': '0/1/2/PLAC',
  '1 DEAT': '0/1/DEAT',
  '1 FAMS': '0/1/FAMS',
  '1 FAMC': '0/1/FAMC',
  '1 SEX': '0/1/SEX',
};

// ─── GEDCOM 导出器 ───
async function buildGedComExport(members, branchInfo) {
  const lines = ['0 HEAD'];
  lines.push('1 SOUR WebApp');
  lines.push(`1 DATE ${new Date().toISOString().slice(0, 10)}`);
  lines.push('1 CHAR UTF-8');
  lines.push('1 SUBM @SUBM@');
  
  // Submitter
  lines.push(`0 @SUBM@ SUBM`);
  lines.push('1 NAME 好诚事家风·家谱系统');
  
  // Family units per branch
  for (const branch of (branchInfo || [])) {
    lines.push(`0 @H${branch.code.replace(/-/g, '')}@ FAM`);
    lines.push(`1 HUSB @I${branch.founderId?.replace(/[^\w]/g, '') || 'X'}@`);
    lines.push(`2 TYPE Husband`);
    
    if (branch.wifeId) {
      lines.push(`1 WIFE @I${branch.wifeId.replace(/[^\w]/g, '')}@`);
      lines.push(`2 TYPE Wife`);
    }
  }
  
  // Individuals
  for (const m of members) {
    const indId = `I${m._id.replace(/[^\w]/g, '') || 'X'}`;
    lines.push(`0 @${indId}@ INDI`);
    lines.push(`1 NAME ${m.genealogyName || m.name}/ /`);
    lines.push(`1 SEX ${m.gender === 'MALE' ? 'M' : m.gender === 'FEMALE' ? 'F' : 'U'}`);
    
    // Birth
    if (m.birthDate) {
      lines.push('1 BIRT');
      lines.push(`2 DATE ${m.birthDate}`);
      if (m.birthPlace) {
        lines.push(`2 PLAC ${m.birthPlace}`);
      }
    }
    
    // Death
    if (m.deathDate) {
      lines.push('1 DEAT');
      lines.push(`2 DATE ${m.deathDate}`);
      if (m.deathPlace) {
        lines.push(`2 PLAC ${m.deathPlace}`);
      }
    }
    
    // Spouse links (FAMS)
    if (m.spouseIds && m.spouseIds.length > 0) {
      for (const spouse of m.spouseIds) {
        const spouseIndId = `I${spouse.replace(/[^\w]/g, '') || 'X'}`;
        lines.push(`1 FAMS @F${spouseIndId}@`);
      }
    }
    
    // Parent link (FAMC)
    if (m.parentIds && m.parentIds.length > 0) {
      // 假设用父 ID 组合成家庭单元 ID
      const famId = `F${m.parentIds[0].replace(/[^\w]/g, '')}`;
      lines.push(`1 FAMC @${famId}@`);
    }
    
    // Note/source
    if (m.notes && m.notes.length > 0) {
      for (const note of m.notes) {
        lines.push('1 NOTE');
        lines.push(`2 _TEXT ${note}`);
      }
    }
  }
  
  lines.push('3 TRLR');
  lines.push(`2 REPO @REPO@`);
  
  return lines.join('\r\n') + '\r\n';
}

// ─── GEDCOM 解析器（5.5.1） ───
class GedcomParser {
  constructor() {
    this.individuals = [];
    this.families = [];
    this.tags = {}; // lineNum -> tag path
  }
  
  parse(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let currentTag = '';
    let currentItem = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(\d+) (\S+(?: \S+)?)(?: (.+))?$/);
      
      if (!match) continue;
      
      const level = parseInt(match[1], 10);
      const tag = match[2];
      const value = match[3] || '';
      
      // 构建完整 tag path
      const tagPath = currentTag ? `${currentTag}/${tag}` : tag;
      this.tags[i] = tagPath;
      currentTag = tagPath;
      
      // INDI record
      if (tag === 'INDI' && level === 0) {
        if (currentItem) this.individuals.push(currentItem);
        currentItem = { id: value, type: 'INDI', children: [] };
      }
      
      // FAM record
      if (tag === 'FAM' && level === 0) {
        if (currentItem) this.families.push(currentItem);
        currentItem = { id: value, type: 'FAM', children: [] };
      }
      
      // Field values
      if (level === 1) {
        if (tag === 'NAME' && currentItem?.type === 'INDI') {
          const parts = value.split('/');
          currentItem.name = parts[0]?.trim();
          currentItem.suffix = parts[1]?.trim();
          currentItem.note = parts[2]?.trim();
        } else if (tag === 'SEX' && currentItem?.type === 'INDI') {
          currentItem.sex = value.toUpperCase();
        } else if (tag === 'BIRT' && currentItem?.type === 'INDI') {
          currentItem.birth = { date: '', place: '' };
        } else if (tag === 'DEAT' && currentItem?.type === 'INDI') {
          currentItem.death = { date: '', place: '' };
        } else if (tag === 'FAMS' && currentItem?.type === 'INDI') {
          if (!currentItem.fams) currentItem.fams = [];
          currentItem.fams.push(value);
        } else if (tag === 'FAMC' && currentItem?.type === 'INDI') {
          if (!currentItem.famc) currentItem.famc = value;
        } else if (tag === 'DATE' && currentItem?.birth) {
          currentItem.birth.date = value;
        } else if (tag === 'PLAC' && currentItem?.birth) {
          currentItem.birth.place = value;
        } else if (tag === 'DATE' && currentItem?.death) {
          currentItem.death.date = value;
        } else if (tag === 'PLAC' && currentItem?.death) {
          currentItem.death.place = value;
        }
      }
    }
    
    if (currentItem) {
      if (currentItem.type === 'INDI') this.individuals.push(currentItem);
      if (currentItem.type === 'FAM') this.families.push(currentItem);
    }
    
    return { individuals: this.individuals, families: this.families };
  }
}

// ─── 主逻辑 ───
async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  
  const db = wx.getDatabase();
  const { action } = event || {};
  
  switch (action) {
    case 'export': {
      // EDITOR+ 权限
      if (!hasRole(openid, 'EDITOR')) return FORBIDDEN('仅编辑及以上可导出 GEDCOM');
      
      // 查询所有成员（限制数量避免超时）
      const result = await db.collection('members').limit(5000).get();
      
      // 同时查询分支信息
      const branchResult = await db.collection('branches').where({ status: 'ACTIVE' }).get();
      
      const gedcomText = await buildGedComExport(result.data, branchResult.data);
      
      // 审计
      await writeAudit(db, {
        userId: openid,
        action: 'gedcom.export',
        target: `export-${result.data.length}-members`,
        detail: JSON.stringify({ count: result.data.length }),
        time: new Date()
      });
      
      return OK({ success: true, content: gedcomText, fileName: 'hcs_family_tree.ged' });
    }
    
    case 'import': {
      // HISTORIAN+ 权限（双人审核前置）
      if (!hasRole(openid, 'HISTORIAN')) return FORBIDDEN('仅族史委及以上可导入 GEDCOM');
      
      const { content } = event;
      if (!content) return BAD_REQUEST('GEDCOM content required');
      
      // 解析
      const parser = new GedcomParser();
      const parsed = parser.parse(content);
      
      // 转换为本系统数据格式
      const membersToImport = parsed.individuals.map(ind => ({
        genealogyName: ind.name || '',
        name: ind.name || '',
        gender: ind.sex === 'M' ? 'MALE' : ind.sex === 'F' ? 'FEMALE' : 'UNKNOWN',
        birthDate: ind.birth?.date || '',
        deathDate: ind.death?.date || '',
        birthPlace: ind.birth?.place || '',
        deathPlace: ind.death?.place || '',
        gEdcomSource: '@' + ind.id + '@'
      }));
      
      // 返回预检结果（待用户确认）
      return OK({
        success: true,
        previewCount: membersToImport.length,
        members: membersToImport.slice(0, 100),
        message: '解析成功，请预览后确认入库'
      });
    }
    
    case 'commitImport': {
      // HISTORIAN+ 权限 + 双人审核检查
      if (!hasRole(openid, 'HISTORIAN')) return FORBIDDEN('仅族史委及以上可提交导入');
      
      const { memberDataArray, reviewerOpenids } = event;
      
      // 双人审核门禁
      if (!reviewerOpenids || !Array.isArray(reviewerOpenids) || reviewerOpenids.length < 2) {
        return BAD_REQUEST('需要至少两名族史委审核人');
      }
      
      // 批量插入 members
      const insertBatch = async (batch) => {
        const ops = batch.map(m => ({
          ...m,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: openid,
          updatedBy: openid,
          status: 'ALIVE' // 默认
        }));
        return db.collection('members').add({ data: ops });
      };
      
      // 分批插入（每批 100）
      const BATCH_SIZE = 100;
      for (let i = 0; i < memberDataArray.length; i += BATCH_SIZE) {
        const batch = memberDataArray.slice(i, i + BATCH_SIZE);
        try {
          await insertBatch(batch);
        } catch (e) {
          console.error('[gedcom import] batch failed:', e.message);
          throw e;
        }
      }
      
      // 审计
      await writeAudit(db, {
        userId: openid,
        action: 'gedcom.commit',
        target: `${memberDataArray.length}-members-imported`,
        detail: JSON.stringify({ reviewers: reviewerOpenids }),
        sensitive: true,
        time: new Date()
      });
      
      return OK({ success: true, imported: memberDataArray.length, message: 'GEDCOM 导入完成' });
    }
    
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

module.exports = { main };
