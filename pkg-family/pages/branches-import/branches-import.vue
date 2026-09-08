<!-- pkg-family/pages/branches-import/branches-import.vue — 批量导入分支（EDITOR+） -->
<template>
  <view class="container">
    <view class="header">
      <text class="title">批量导入分谱/支谱</text>
      <text class="subtitle">一次最多导入 100 行；code 字段无需填写，系统自动生成 HAO- 编码</text>
    </view>

    <!-- 错误提示 -->
    <ErrorToast v-if="errorMessage" :message="errorMessage" @hide="errorMessage = ''" />

    <!-- 模板下载 -->
    <BaseCard title="下载模板">
      <button size="small" @tap="onDownloadTemplate">📄 生成 CSV 模板并分享</button>
      <text class="hint">表头：name,level,parentCode,region,description,generationVerses</text>
    </BaseCard>

    <!-- 上传区域 -->
    <BaseCard v-if="!rows.length" title="导入分支">
      <button size="default" @tap="onChooseFile">📥 从聊天记录选择文件 (CSV / Excel)</button>
      <text class="hint">支持 .csv、.xlsx、.xls；请先把文件发送到任意微信聊天，再从这里选取。首次上传可预览前 10 行。</text>
    </BaseCard>

    <!-- 预览表 -->
    <view v-if="previewRows.length">
      <view class="preview-title">数据预览（{{ previewRows.length }} 行）</view>
      <view class="preview-table">
        <view class="table-header">
          <view class="th">#</view>
          <view class="th">name</view>
          <view class="th">level</view>
          <view class="th">parentCode</view>
          <view class="th">region</view>
          <view class="th">description</view>
        </view>
        <view class="table-body">
          <view class="tr" v-for="(row, idx) in previewRows" :key="idx">
            <view class="td">{{ idx + 1 }}</view>
            <view class="td">{{ row.name }}</view>
            <view class="td">{{ row.level }}</view>
            <view class="td">{{ row.parentCode || '—' }}</view>
            <view class="td">{{ row.region || '—' }}</view>
            <view class="td">{{ (row.description || '').slice(0, 15) }}</view>
          </view>
        </view>
      </view>
      <view class="actions">
        <button class="btn btn-primary" :loading="submitting" :disabled="submitting" @tap="onSubmitImport">🚀 开始提交</button>
        <button class="btn btn-default" :disabled="submitting" @tap="resetPreview">↩ 重新上传</button>
      </view>
    </view>

    <!-- 结果反馈 -->
    <view v-if="result && (result.success?.length || result.failed?.length)">
      <BaseCard title="导入结果 ✅">
        <text>成功：{{ result.success?.length || 0 }} | 失败：{{ result.failed?.length || 0 }}</text>
        <view class="result-list" v-if="result.success?.length">
          <text class="success-item" v-for="item in result.success.slice(0, 10)" :key="item.code">
            {{ item.row }} → {{ item.code }}
          </text>
        </view>
        <view class="error-list" v-if="result.failed?.length">
          <text class="error-item" v-for="item in result.failed" :key="item.row">
            ❌ {{ item.row }} {{ item.name }} — {{ item.reason }}
          </text>
        </view>
        <button @tap="resetPreview">✅ 关闭</button>
      </BaseCard>
    </view>

    <!-- OCR 占位（R29 启用） -->
    <view class="ocr-hint">
      <BaseCard title="照片 OCR 扫描（功能中）">
        <text class="hint">🔜 本功能将在 R29 开放，届时可上传族谱照片自动识别分支信息。</text>
      </BaseCard>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import BaseCard from '@/components/common/BaseCard.vue';
import ErrorToast from '@/components/common/ErrorToast.vue';
import { importBranches } from '@/services/branch';

const rows = ref([]);
const previewRows = ref([]);
const submitting = ref(false);
const errorMessage = ref('');
const result = ref(null);

/** 模板表头 */
const TEMPLATE_HEADER = 'name,level,parentCode,region,description,generationVerses';

/** 下载模板：生成 CSV 写入本地后通过微信分享（wx.shareFileMessage），失败则复制表头 */
function onDownloadTemplate() {
  const content = `${TEMPLATE_HEADER}\n示例分支,2,,河北省石家庄市赵县,示例描述,字辈诗\n示例支谱,3,HAO-0000-01,赵县南庄,示例支谱描述,天地玄黄\n`;
  const fs = uni.getFileSystemManager();
  const path = `${uni.env.USER_DATA_PATH}/branches-template.csv`;
  try {
    fs.writeFileSync(path, content, 'utf8');
    // #ifdef MP-WEIXIN
    wx.shareFileMessage({
      filePath: path,
      fileName: 'branches-template.csv',
      success: () => uni.showToast({ title: '模板已分享', icon: 'success' }),
      fail: () => fallbackCopyTemplate()
    });
    // #endif
    // #ifndef MP-WEIXIN
    fallbackCopyTemplate();
    // #endif
  } catch (e) {
    console.error('template write error:', e);
    fallbackCopyTemplate();
  }
}

/** 降级方案：复制模板表头到剪贴板 */
function fallbackCopyTemplate() {
  uni.setClipboardData({
    data: TEMPLATE_HEADER,
    success: () => uni.showToast({ title: '已复制表头，请粘贴到 Excel', icon: 'none' })
  });
}

/** 从微信聊天记录选择文件（uni.chooseMessageFile 仅微信小程序支持） */
function onChooseFile() {
  // #ifdef MP-WEIXIN
  wx.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['csv', 'xlsx', 'xls'],
    success: (res) => {
      if (!res.tempFiles?.length) return;
      handleFile(res.tempFiles[0]);
    },
    fail: (err) => {
      if (err?.errMsg?.includes('cancel')) return;
      errorMessage.value = '选择文件失败，请重试';
    }
  });
  // #endif
  // #ifndef MP-WEIXIN
  uni.showToast({ title: '当前平台暂不支持文件导入', icon: 'none' });
  // #endif
}

/** 处理选中的文件：按扩展名分发到 CSV / Excel 解析 */
async function handleFile(file) {
  errorMessage.value = '';
  try {
    const name = (file.name || file.path || '').toLowerCase();
    if (name.endsWith('.csv') || file.type === 'csv') {
      const text = await readFileText(file.path);
      rows.value = parseCSV(text);
    } else {
      // xlsx/xls：当前为占位实现，R29 接入 SheetJS
      rows.value = parseExcelPlaceholder();
    }

    if (!rows.value.length) {
      errorMessage.value = '文件为空或格式不正确（首行需为表头）';
      return;
    }
    previewRows.value = rows.value.slice(0, 10);
    result.value = null;
    uni.showToast({ title: `已读取 ${rows.value.length} 行`, icon: 'success' });
  } catch (err) {
    console.error('file read error:', err);
    errorMessage.value = '读取失败，请确认文件格式后重试';
  }
}

/** 解析 CSV（支持引号内逗号） */
function parseCSV(fileContent) {
  const lines = String(fileContent || '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  return lines
    .slice(1)
    .map((line, idx) => {
      if (!line.trim()) return null;
      const values = splitCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => (obj[h] = (values[i] || '').trim()));
      obj._rawIndex = idx + 2; // 文件行号（含表头）
      return obj;
    })
    .filter(Boolean)
    .map(normalizeRow);
}

/** 按引号感知方式拆分一行 CSV */
function splitCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 规范化行字段：必填校验 + level 约束 */
function normalizeRow(row) {
  const level = parseInt(row.level, 10);
  return {
    name: row.name || '',
    level: level === 2 || level === 3 ? level : 0, // 0 表示非法，提交前拦截
    parentCode: row.parentCode || '',
    region: row.region || '',
    description: row.description || '',
    generationVerses: row.generationVerses || '',
    _rawIndex: row._rawIndex
  };
}

/** Excel 解析占位（R29 接入 SheetJS 后替换） */
function parseExcelPlaceholder() {
  uni.showToast({ title: 'Excel 解析将在 R29 支持，请先使用 CSV', icon: 'none' });
  return [];
}

/** 读取文本文件内容（Promise 封装） */
function readFileText(path) {
  return new Promise((resolve, reject) => {
    uni.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'utf8',
      success: (res) => resolve(res.data),
      fail: reject
    });
  });
}

/** 重置预览与结果 */
function resetPreview() {
  rows.value = [];
  previewRows.value = [];
  result.value = null;
  errorMessage.value = '';
}

/** 提交导入：本地预校验后调用云函数 */
async function onSubmitImport() {
  if (!rows.value.length) {
    errorMessage.value = '请先选择文件';
    return;
  }
  if (rows.value.length > 100) {
    errorMessage.value = '单次最多导入 100 行';
    return;
  }
  // 本地预校验：name 必填、level 必须为 2/3
  const invalid = rows.value.filter((r) => !r.name || ![2, 3].includes(r.level));
  if (invalid.length) {
    errorMessage.value = `第 ${invalid.slice(0, 5).map((r) => r._rawIndex).join('、')} 行数据不合法（name 必填，level 仅支持 2 或 3）`;
    return;
  }

  submitting.value = true;
  errorMessage.value = '';
  try {
    const res = await importBranches(rows.value);
    if (res?.success) {
      result.value = res.data;
      uni.showToast({ title: '导入完成', icon: 'success' });
    } else {
      errorMessage.value = res?.message || '导入失败，请稍后重试';
    }
  } catch (e) {
    console.error('import error:', e);
    errorMessage.value = e?.message || '网络异常，请稍后重试';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.container { padding: 20px; background: #f7f8fa; min-height: 100vh; }
.header { margin-bottom: 16px; }
.title { font-size: 20px; font-weight: bold; color: #333; display: block; }
.subtitle { font-size: 12px; color: #888; margin-top: 4px; display: block; }
.preview-title { font-size: 15px; font-weight: bold; color: #333; margin: 16px 0 8px; }
.preview-table { overflow-x: auto; }
.table-header { display: flex; background: #eee; font-weight: bold; padding: 8px; }
.table-body { max-height: 200px; overflow-y: auto; }
.tr { display: flex; border-bottom: 1px solid #ddd; padding: 6px; }
.th, .td { flex: 1; padding-left: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.actions { margin-top: 16px; display: flex; gap: 8px; }
.btn { flex: 1; }
.btn-primary { background: #07c160; color: #fff; }
.btn-default { background: #f2f2f2; color: #333; }
.result-list, .error-list { margin-top: 12px; }
.success-item { display: block; color: #07c160; margin: 4px 0; font-size: 13px; }
.error-item { display: block; color: #ee0a24; margin: 4px 0; font-size: 13px; }
.ocr-hint { margin-top: 24px; opacity: 0.6; }
.hint { font-size: 12px; color: #999; display: block; margin-top: 8px; line-height: 1.5; }
</style>
