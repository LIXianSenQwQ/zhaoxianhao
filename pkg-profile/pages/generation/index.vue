<!--
  pkg-profile/pages/generation/index.vue — 字辈展示（蓝图 V1.1 §8 字辈 / §23.2）
  数据：profile.generation.list → { chars[], total, member{memberId,name,generation}, canEdit }
  交互：
    · 字辈大字横向画卷 + 当前成员定位（世代徽标高亮）
    · canEdit（EDITOR+）可展开内联编辑（空格分隔提交，updateFamilyInfo 落 settings.generation_chars）
  降级：未配置字辈 → 引导文案；非 EDITOR 不显示编辑入口
-->
<template>
  <view class="gen-page">
    <!-- 我的定位卡 -->
    <view class="my-card">
      <view class="my-left">
        <text class="my-label">我的字辈定位</text>
        <text v-if="member && member.generation" class="my-name">
          {{ member.name || '郝氏后人' }} · 第 {{ member.generation }} 世
        </text>
        <text v-else class="my-name dim">尚未绑定谱系成员</text>
      </view>
      <view v-if="myChar" class="my-char">{{ myChar }}</view>
    </view>

    <!-- 字辈画卷 -->
    <view class="scroll-card" v-if="loading">
      <view class="sk-line" />
    </view>
    <view v-else-if="chars.length" class="scroll-card">
      <view class="scroll-head">
        <text class="scroll-title">郝氏字辈 · {{ total }} 字</text>
        <text class="scroll-note">字序诗</text>
      </view>
      <scroll-view class="chars-scroll" scroll-x :show-scrollbar="false">
        <view class="chars-row">
          <view
            v-for="(c, i) in chars"
            :key="i"
            class="char-cell"
            :class="{ mine: myIndex === i }"
          >
            <text class="char-big">{{ c }}</text>
            <text class="char-idx">{{ i + 1 }}</text>
          </view>
        </view>
      </scroll-view>
      <text class="scroll-desc">同辈共用一字，字辈即行辈次序；翻查谱牒可定位世系。</text>
    </view>
    <view v-else class="scroll-card empty">
      <text class="empty-t">字辈序列尚未录入</text>
      <text class="empty-s">由族史委经家族信息维护录入「字辈」后展示于此</text>
    </view>

    <!-- 编辑区（EDITOR+） -->
    <view v-if="canEdit" class="edit-wrap">
      <button class="edit-toggle" @click="showEdit = !showEdit">
        {{ showEdit ? '收起编辑' : (chars.length ? '修订字辈' : '录入字辈') }}
      </button>
      <view v-if="showEdit" class="edit-panel">
        <textarea
          class="edit-input"
          v-model="editText"
          placeholder="按顺序输入字辈，以空格或顿号分隔，如：庆 昌 永 世 传 家"
          maxlength="300"
          :auto-height="true"
        />
        <view class="edit-actions">
          <text class="char-count">{{ editText.replace(/[\s、，,]+/g, '').length }} 字</text>
          <button class="save-btn" :disabled="saving" @click="saveChars">
            {{ saving ? '保存中…' : '保存字辈' }}
          </button>
        </view>
        <text class="edit-note">保存后全族可见（settings.generation_chars，每项≤3 字）</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { listGenerations, saveGenerationChars } from '@/services/profile';

const chars = ref<string[]>([]);
const member = ref<any>(null);
const canEdit = ref(false);
const loading = ref(true);
const showEdit = ref(false);
const editText = ref('');
const saving = ref(false);

async function load() {
  loading.value = true;
  const res = await listGenerations();
  loading.value = false;
  const d = res.data;
  if (d) {
    chars.value = d.chars || [];
    member.value = d.member || null;
    canEdit.value = !!d.canEdit;
    editText.value = chars.value.join(' ');
  }
}
onShow(load);

/** 当前成员在字辈中的下标（第 N 世 → 数组 N-1 位，越界则 -1） */
const myIndex = computed(() => {
  if (!member.value || !member.value.generation) return -1;
  const g = Number(member.value.generation);
  const i = g - 1;
  return i >= 0 && i < chars.value.length ? i : -1;
});
const myChar = computed(() => (myIndex.value >= 0 ? chars.value[myIndex.value] : ''));

async function saveChars() {
  const list = editText.value
    .replace(/[\s、，,。；;]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(s => s.slice(0, 3));
  if (!list.length) return uni.showToast({ title: '请输入字辈', icon: 'none' });
  saving.value = true;
  const res = await saveGenerationChars(list);
  saving.value = false;
  if (res.error && !res.data) {
    uni.showToast({ title: (res.error as any)?.message || '保存失败', icon: 'none' });
  } else {
    uni.showToast({ title: '字辈已保存', icon: 'success' });
    showEdit.value = false;
    load();
  }
}
</script>

<style lang="scss" scoped>
.gen-page { min-height: 100vh; background: #FAF8F2; padding: 16px 12px 32px; box-sizing: border-box; }

.my-card {
  display: flex; align-items: center; justify-content: space-between;
  background: linear-gradient(135deg, #B03A2E 0%, #C96A5E 100%);
  border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 4px 16px rgba(176,58,46,.2);
}
.my-left { flex: 1; min-width: 0; }
.my-label { display: block; font-size: 11px; color: rgba(255,255,255,.72); letter-spacing: 1px; }
.my-name { display: block; font-size: 15px; color: #FFF; font-weight: 600; margin-top: 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.my-name.dim { color: rgba(255,255,255,.7); font-weight: 400; }
.my-char {
  width: 56px; height: 56px; line-height: 56px; text-align: center;
  background: #FFF; color: #B03A2E; font-size: 32px; font-weight: 700; border-radius: 10px; flex-shrink: 0;
}

.scroll-card {
  background: #FFF; border-radius: 12px; padding: 14px; margin-bottom: 12px;
  box-shadow: 0 2px 12px rgba(38,34,30,.06);
}
.scroll-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.scroll-title { font-size: 14px; font-weight: 700; color: #2B2723; letter-spacing: 1px; }
.scroll-note { font-size: 11px; color: #C9A063; }

.chars-scroll { width: 100%; white-space: nowrap; }
.chars-row { display: inline-flex; gap: 10px; padding: 2px 2px 6px; }
.char-cell {
  width: 64px; padding: 10px 0 6px; text-align: center;
  background: #F7F4EC; border-radius: 8px; border: 1px solid #F0EBDF;
  flex-shrink: 0;
}
.char-cell.mine { background: #FBEEEC; border-color: #E0B8B2; box-shadow: 0 0 0 1.5px #B03A2E inset; }
.char-big { display: block; font-size: 28px; font-weight: 700; color: #4A443C; line-height: 1.3; }
.char-cell.mine .char-big { color: #B03A2E; }
.char-idx { display: block; font-size: 10px; color: #B0A99A; margin-top: 2px; }
.char-cell.mine .char-idx { color: #C96A5E; }
.scroll-desc { display: block; font-size: 12px; color: #8A7B5A; line-height: 1.7; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #EAE4D6; }

.empty { text-align: center; padding: 40px 20px; }
.empty-t { display: block; font-size: 15px; font-weight: 600; color: #6E6659; }
.empty-s { display: block; font-size: 12px; color: #B0A99A; margin-top: 6px; }

.edit-wrap { margin-top: 4px; }
.edit-toggle {
  height: 42px; line-height: 42px; font-size: 14px; font-weight: 600;
  background: #FFF; color: #8A7B5A; border: 1px solid #EAE4D6; border-radius: 8px; padding: 0;
}
.edit-panel { background: #FFF; border-radius: 12px; padding: 14px; margin-top: 10px; }
.edit-input {
  width: 100%; min-height: 88px; box-sizing: border-box;
  background: #FAF8F2; border-radius: 8px; padding: 10px; font-size: 14px; color: #2B2723;
}
.edit-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
.char-count { font-size: 12px; color: #B0A99A; }
.save-btn { width: 130px; height: 38px; line-height: 38px; font-size: 13px; color: #FFF; background: #B03A2E; border-radius: 8px; padding: 0; }
.save-btn[disabled] { background: #D8A59D; }
.edit-note { display: block; font-size: 11px; color: #B0A99A; margin-top: 8px; }

.sk-line { height: 120px; border-radius: 8px; background: linear-gradient(90deg,#F0EDE4 25%,#F7F4EC 50%,#F0EDE4 75%); background-size: 400% 100%; animation: shimmer 1.2s ease infinite; }
@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
</style>
