/**
 * cloud/functions/pdf-gen/index.js — PDF 谱书生成模块（R33 P3）
 *
 * 功能：
 *   - generateBook: 生成整支族谱 PDF（树状图/成员列表/字辈诗）
 *   - preview: 返回预览尺寸与页数估算
 *   - exportAssets: 提取内部资源（SVG 树图/字体）
 *
 * 权限：EDITRO+/CHIEF+（打印操作需要高级别授权）
 *
 * 技术选型占位：
 *   • node-html-pdf (Puppeteer headless) → 生产环境
 *   • html2canvas + jsPDF (前端) → 小范围成员导出
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

// ─── 工具 ───
function pickDoc(res) {
  const arr = res && res.data;
  if (Array.isArray(arr)) return arr.length ? arr[0] : null;
  return arr || null;
}

async function requesterCtx(db, openid) {
  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';
  return { openid, role };
}

/**
 * R33-1: 生成族谱 PDF（占位接口）
 * 真实流程：
 *   1. 拉取 members 数据（分支代码过滤）
 *   2. 生成 HTML 模板（tree layout + member cards）
 *   3. 调用 Puppeteer 转 PDF
 *   4. 上传云存储 → 返回下载 URL
 */
async function generateBook(ctx, { branchId, format = 'fan' } = {}) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可生成族谱 PDF');
  
  // 校验参数
  if (!branchId) return BAD_REQUEST('branchId required');
  if (!['fan', 'lineage', 'table'].includes(format)) {
    return BAD_REQUEST('format must be fan|lineage|table');
  }

  // 查询分支信息
  const bRes = await db.collection('branches').where({ code: branchId }).limit(1).get();
  const branch = pickDoc(bRes);
  if (!branch) return NOT_FOUND('分支不存在');

  // 拉取成员（游标分页，复用 R32 analytics 模式）
  const PAGE_SIZE = 500;
  const members = [];
  let skip = 0;
  for (;;) {
    let query = db.collection('members').where({ branchId }).skip(skip).limit(PAGE_SIZE);
    if (typeof query.field === 'function') query = query.field({ 
      genealogyName: true, name: true, gender: true, birthDate: true, deathDate: true, generation: true, path: true 
    });
    const res = await query.get();
    const page = (res.data || []);
    if (page.length === 0) break;
    members.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  // 模拟生成 PDF 尺寸与页数（真实应渲染 HTML 并测量）
  const totalPages = Math.ceil(members.length / 50) + 2; // 每页 50 人 +2 页头尾
  const fileSizeEstimateKB = members.length * 0.8; // 每人约 0.8KB
  
  // 审计日志
  await writeAudit(db, {
    userId: ctx.openid,
    action: 'pdf.generate',
    target: `${branch.code}/${member.length}`,
    detail: JSON.stringify({ format }),
    time: new Date()
  });

  // 返回预览信息（真实环境返回 fileId/downloadUrl）
  return OK({ 
    success: true,
    message: 'PDF 生成中...',
    jobId: `pdf_${branchId}_${Date.now()}`,
    estimate: {
      totalMembers: members.length,
      totalPages,
      fileSizeKB: fileSizeEstimateKB,
      format
    },
    note: '真实环境将上传至云存储并返回 downloadUrl（需 Puppeteer 集成）'
  });
}

/** R33-2: 预览 PDF 配置 */
async function previewConfig(ctx, { branchId, scale = 1 } = {}) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'MEMBER')) return FORBIDDEN('认证族人方可查看预览');

  const bRes = await db.collection('branches').where({ code: branchId }).limit(1).get();
  const branch = pickDoc(bRes);
  if (!branch) return NOT_FOUND('分支不存在');

  return OK({
    branchId,
    pageSizes: ['A4', 'Legal', 'Letter'],
    scales: [0.5, 0.75, 1, 1.25],
    currentScale: scale,
    paperOrientation: ['portrait', 'landscape'],
    note: '真实环境支持多纸张规格选择'
  });
}

/** R33-3: 导出 SVG 树图（Fan Tree 矢量图） */
async function exportSvgTree(ctx, { branchId, maxDepth = 4 } = {}) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'MEMBER')) return FORBIDDEN('认证族人可查看树图');

  const bRes = await db.collection('branches').where({ code: branchId }).limit(1).get();
  const branch = pickDoc(bRes);
  if (!branch) return NOT_FOUND('分支不存在');

  // 获取分支下所有成员
  const membersRes = await db.collection('members')
    .where({ branchId })
    .orderBy('generation', 'asc')
    .limit(200)
    .get();
  
  const members = (membersRes.data || []).slice(0, 200);

  // 计算最大世代深度
  const maxGen = members.reduce((max, m) => Math.max(max, m.generation || 0), 0);
  const actualDepth = Math.min(maxDepth, maxGen);

  // 模拟 SVG 路径（真实应生成完整 SVG 路径数据）
  const svgHeight = actualDepth * 80 + 200;
  const svgWidth = Math.min(1200, members.length * 20);

  return OK({
    success: true,
    viewBox: `0 0 ${svgWidth} ${svgHeight}`,
    membersCount: members.length,
    depth: actualDepth,
    note: '真实环境返回完整 SVG 字符串（基于 tree-layout.js 布局算法）'
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
      case 'generateBook': return await generateBook(ctx, event || {});
      case 'previewConfig': return await previewConfig(ctx, event || {});
      case 'exportSvgTree': return await exportSvgTree(ctx, event || {});
      default: return BAD_REQUEST(`未知 action: ${action}`);
    }
  } catch (e) {
    console.error('[pdf-gen.main] error:', e);
    return BAD_REQUEST(e.message);
  }
} };
