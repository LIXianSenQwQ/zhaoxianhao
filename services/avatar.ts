/**
 * services/avatar.ts — 头像上传服务封装
 * 
 * V1.1 22.1 头像上传与展示系统定案：
 *   · 前端限 JPG/PNG/WEBP，其他格式前端即拒
 *   · 前端裁剪（1:1/4:3/原图）+ 美化滑杆（亮度/对比度）
 *   · 后端 CI 压缩至 ≤200KB + 统一 WEBP + 生成缩略图（80/200/600 三档）
 */
import { call, write } from './request';

// 允许的上传格式
const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];

/** 上传前格式校验 */
export function validateAvatarFormat(path: string): boolean {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return ALLOWED_FORMATS.includes(ext);
}

/** 上传头像（含压缩处理） */
export function uploadAvatar(params: {
  fileId: string;          // 云存储 fileID
  cropMeta?: {
    ratio: '1:1' | '4:3' | 'original';
    rotation: number;      // 0-270 步进
    brightness: number;    // -50 ~ +50
    contrast: number;      // -50 ~ +50
  };
  visibility?: 'PRIVATE' | 'PUBLIC' | 'GROUP';
}) {
  return write('profile', {
    action: 'saveAvatar',
    ...params
  }, 'avatar', `avatar_${Date.now()}`);
}

/** 获取当前用户头像 */
export function getMyAvatar() {
  return call('profile', { action: 'getAvatar' }, 'avatar:mine', 60000);
}

/** 获取某个成员的头像 */
export function getMemberAvatar(memberId: string) {
  return call('profile', { action: 'getMemberAvatar', memberId }, `avatar:member:${memberId}`, 60000);
}

/**
 * 前端裁剪 - 调用 uni.chooseImage 并裁剪
 * 注意：完整裁剪组件在 pages/profile/photomgr 中使用
 */
export function chooseAndCrop(mode: '1:1' | '4:3' = '1:1'): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFilePaths[0];
        if (!validateAvatarFormat(path)) {
          reject(new Error('仅支持 JPG/PNG/WEBP 格式'));
          return;
        }
        // TODO: 使用 image-cropper 组件进行裁剪（projects/profile/avatar 页面）
        resolve(path);
      },
      fail: (err) => reject(err)
    });
  });
}