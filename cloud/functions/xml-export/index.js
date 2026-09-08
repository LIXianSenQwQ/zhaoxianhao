/**
 * cloud/functions/xml-export/index.js — XML/RDF 语义网导出模块（R33 P3）
 *
 * 功能（框架 §4.1 P3）：
 *   - exportXML: GEDCOM-XML / 语义网 RDF 导出（Linked Open Data）
 *   - exportRDF: FOAF 本体（人物关系图）
 *
 * 权限：HISTORIAN+（跨平台数据语义对接）
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

// ─── 工具 ───
async function requesterCtx(db, openid) {
  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';
  return { openid, role };
}

/**
 * XML 转义（XML 1.0 特殊字符）
 */
function xmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * R33-1: GEDCOM-XML 导出
 * 参考标准：GEDCOM X (FamilySearch) XML schema
 */
async function exportXML(ctx, { branchId, maxRecords = 5000 } = {}) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'HISTORIAN')) return FORBIDDEN('仅族史委及以上可导出 XML');

  if (!branchId) return BAD_REQUEST('branchId required');

  // 查询分支
  const bRes = await db.collection('branches').where({ code: branchId }).limit(1).get();
  const branch = (bRes.data || [])[0];
  if (!branch) return NOT_FOUND('分支不存在');

  // 拉取成员
  const membersRes = await db.collection('members')
    .where({ branchId })
    .limit(maxRecords)
    .get();
  const members = (membersRes.data || []).slice(0, maxRecords);

  // 构造 GEDCOM-X XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<gedcomx xmlns="http://gedcomx.org/v1/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n';
  xml += '  <description>#root</description>\n';
  
  // 人物节点
  for (const m of members) {
    xml += `  <person id="${xmlEscape(m._id)}">\n`;
    xml += `    <gender>${xmlEscape(m.gender === 'MALE' ? 'MALE' : m.gender === 'FEMALE' ? 'FEMALE' : 'UNKNOWN')}</gender>\n`;
    xml += `    <name>\n`;
    xml += `      <nameForm>\n`;
    xml += `        <fullText>${xmlEscape(m.genealogyName || m.name)}</fullText>\n`;
    xml += `      </nameForm>\n`;
    xml += `    </name>\n`;
    if (m.birthDate) {
      xml += `    <fact type="http://gedcomx.org/Birth">\n`;
      xml += `      <date>${xmlEscape(m.birthDate)}</date>\n`;
      xml += `    </fact>\n`;
    }
    if (m.deathDate) {
      xml += `    <fact type="http://gedcomx.org/Death">\n`;
      xml += `      <date>${xmlEscape(m.deathDate)}</date>\n`;
      xml += `    </fact>\n`;
    }
    xml += `  </person>\n`;
  }

  xml += '</gedcomx>';

  // 审计
  await writeAudit(db, {
    userId: ctx.openid,
    action: 'xml.export',
    target: `${branch.code}/${members.length}`,
    detail: JSON.stringify({ format: 'gedcomx' }),
    sensitive: true,
    time: new Date()
  });

  return OK({
    success: true,
    format: 'gedcomx',
    xmlString: xml,
    recordCount: members.length,
    byteSize: Buffer.byteLength(xml, 'utf8')
  });
}

/**
 * R33-2: RDF/FOAF 导出（Linked Open Data）
 * 本体：FOAF + bio + family (custom)
 */
async function exportRDF(ctx, { branchId, format = 'turtle' } = {}) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'HISTORIAN')) return FORBIDDEN('仅族史委及以上可导出 RDF');

  if (!branchId) return BAD_REQUEST('branchId required');
  if (!['turtle', 'rdfxml', 'ntriples'].includes(format)) {
    return BAD_REQUEST('format must be turtle|rdfxml|ntriples');
  }

  // 查询分支
  const bRes = await db.collection('branches').where({ code: branchId }).limit(1).get();
  const branch = (bRes.data || [])[0];
  if (!branch) return NOT_FOUND('分支不存在');

  const membersRes = await db.collection('members')
    .where({ branchId })
    .limit(2000)
    .get();
  const members = (membersRes.data || []);

  let output = '';

  if (format === 'turtle') {
    // Turtle 格式
    output = '@prefix foaf: <http://xmlns.com/foaf/0.1/> .\n';
    output += '@prefix bio: <http://purl.org/vocab/bio/0.1/> .\n';
    output += '@prefix family: <http://example.org/family/> .\n';
    output += '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n\n';

    for (const m of members) {
      const subject = `family:${m._id}`;
      output += `${subject} a foaf:Person ;\n`;
      output += `  foaf:name "${xmlEscape(m.genealogyName || m.name)}"`;
      if (m.generation) output += ` ;\n  family:generation ${m.generation}`;
      if (m.branchId) output += ` ;\n  family:branch "${xmlEscape(m.branchId)}"`;
      if (m.birthDate) output += ` ;\n  bio:birth "${xmlEscape(m.birthDate)}"`;
      if (m.deathDate) output += ` ;\n  bio:death "${xmlEscape(m.deathDate)}"`;
      output += ' .\n';
    }
  } else if (format === 'rdfxml') {
    // RDF/XML
    output = '<?xml version="1.0" encoding="UTF-8"?>\n';
    output += '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"\n';
    output += '         xmlns:foaf="http://xmlns.com/foaf/0.1/"\n';
    output += '         xmlns:family="http://example.org/family/">\n';
    for (const m of members) {
      output += `  <foaf:Person rdf:about="http://example.org/family/${xmlEscape(m._id)}">\n`;
      output += `    <foaf:name>${xmlEscape(m.genealogyName || m.name)}</foaf:name>\n`;
      if (m.generation) output += `    <family:generation>${m.generation}</family:generation>\n`;
      output += `  </foaf:Person>\n`;
    }
    output += '</rdf:RDF>';
  } else {
    // N-Triples
    output = members.map(m => 
      `<http://example.org/family/${m._id}> <http://xmlns.com/foaf/0.1/name> "${xmlEscape(m.genealogyName || m.name)}" .`
    ).join('\n');
  }

  // 审计
  await writeAudit(db, {
    userId: ctx.openid,
    action: 'rdf.export',
    target: `${branch.code}/${members.length}`,
    detail: JSON.stringify({ format }),
    sensitive: true,
    time: new Date()
  });

  return OK({
    success: true,
    format,
    content: output,
    recordCount: members.length,
    byteSize: Buffer.byteLength(output, 'utf8')
  });
}

module.exports = { main: async (event = {}, context = {}) => {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');

  const db = wx.getDatabase();
  const ctx = await requesterCtx(db, openid);
  const { action } = event;

  try {
    switch (action) {
      case 'exportXML': return await exportXML(ctx, event || {});
      case 'exportRDF': return await exportRDF(ctx, event || {});
      default: return BAD_REQUEST(`未知 action: ${action}`);
    }
  } catch (e) {
    console.error('[xml-export.main] error:', e);
    return BAD_REQUEST(e.message);
  }
} };
