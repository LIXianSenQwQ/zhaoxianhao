/**
 * services/profile.ts — V1.1 个人资料扩展服务
 * 100% 对齐 cloud/functions/profile/index.js 真实契约（R20/R22/R23）：
 *   saveAvatar / updateIntro / updateFamilyInfo /
 *   greeting.save / greeting.list / greeting.active /
 *   motto.get / generation.list /
 *   capsule.create / capsule.scan / capsule.list
 * 蓝图 V1.1 第八部分（个人中心扩展：头像/问候/家训/字辈/百年胶囊）
 */
import { call, write } from './request';

// ═══════════ 头像（V1.1 22.1；裁剪走 photomgr 页内 image-cropper） ═══════════

/** 保存头像（profile.saveAvatar：CI 转码 WEBP + 缩略图 80/200/600） */
export function saveAvatar(params: {
  userId?: string;         // 缺省=本人
  fileId: string;          // 云存储 fileID（前端先 uni.uploadFile）
  cropMeta?: { ratio?: '1:1' | '4:3' | 'original'; rotation?: number; brightness?: number; contrast?: number };
  visibility?: 'PRIVATE' | 'PUBLIC' | 'GROUP';
}) {
  return write('profile', { action: 'saveAvatar', ...params }, 'avatar', `avatar_${Date.now()}`);
}

/** 更新个人问候语/介绍视频（profile.updateIntro：问候 ≤200 字） */
export function updateIntro(params: { userId?: string; greeting?: string; introVideoFileId?: string }) {
  return write('profile', { action: 'updateIntro', ...params }, 'intro', `intro_${Date.now()}`);
}

// ═══════════ 家风家训（settings.family_motto） ═══════════

/** 获取当前家训（profile.motto.get，返回 motto + canEdit） */
export function getMotto() {
  return call<{ motto: string; canEdit: boolean; source: string }>('profile', { action: 'motto.get' }, 'motto:get', 60000);
}

/** 保存/更新家训（profile.updateFamilyInfo，EDITOR+，≤500 字） */
export function saveMotto(familyMotto: string) {
  return write('profile', { action: 'updateFamilyInfo', familyMotto }, 'motto', `motto_${Date.now()}`);
}

// ═══════════ 字辈展示（settings.generation_chars） ═══════════

/** 字辈序列 + 我的成员定位（profile.generation.list） */
export function listGenerations(branchId?: string) {
  return call<{ chars: string[]; total: number; member: any; canEdit: boolean }>(
    'profile', { action: 'generation.list', branchId }, `gen:${branchId || 'all'}`, 60000);
}

/** 保存/更新字辈（profile.updateFamilyInfo，EDITOR+，每项≤3 字） */
export function saveGenerationChars(generationChars: string[]) {
  return write('profile', { action: 'updateFamilyInfo', generationChars }, 'gen', `gen_${Date.now()}`);
}

// ═══════════ 家庭问候语（greeting_cards） ═══════════

export type GreetingTemplateId = 'default' | 'morning' | 'night' | 'festival' | 'solar' | 'family';

/** 保存问候语卡（profile.greeting.save，content.text ≤200 字） */
export function saveGreeting(params: {
  content: { text: string; font?: 'song' | 'kai'; size?: 14 | 16 | 18 | 20; color?: string; align?: 'left' | 'center' | 'right' };
  templateId?: GreetingTemplateId;
  schedule?: { time: string; weekdays: number[]; enabled: boolean };
  familyId?: string;
}) {
  return write('profile', { action: 'greeting.save', ...params }, 'greet', `greet_${Date.now()}`);
}

/** 我的问候语卡列表（profile.greeting.list） */
export function listGreetings() {
  return call<{ cards: any[] }>('profile', { action: 'greeting.list' }, 'greet:list', 60000);
}

/** 当前展示问候语（profile.greeting.active：最近一条 ACTIVE） */
export function getActiveGreeting() {
  return call<{ card: any }>('profile', { action: 'greeting.active' }, 'greet:active', 60000);
}

// ═══════════ 百年设置定时解密胶囊（time_capsules，蓝图 24.5） ═══════════

/** 创建百年胶囊（profile.capsule.create，unlockDate 晚于今天） */
export function createCapsule(params: { targetType: string; targetId: string; unlockDate: string; message?: string }) {
  return write('profile', { action: 'capsule.create', ...params }, 'capsule', `capsule_${Date.now()}`);
}

/** 我的胶囊列表（profile.capsule.list） */
export function listCapsules() {
  return call<{ capsules: any[] }>('profile', { action: 'capsule.list' }, 'capsule:list', 30000);
}
