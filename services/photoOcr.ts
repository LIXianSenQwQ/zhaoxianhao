/**
 * services/photoOcr.ts — 族谱照片 OCR 服务封装
 * 对应云函数：photo_ocr（R29 接入）
 * 
 * actions:
 *   uploadPolicy: 获取上传策略
 *   detectBranchFromPhoto: 照片 → OCR → 字段解析
 */
import { call } from './request';

/** 上传策略 */
export function getUploadPolicy() {
  return call('photo_ocr', { action: 'uploadPolicy' }, 'photo_ocr_policy', 60000);
}

/** 从照片识别分支信息 */
export function detectBranchFromPhoto(fileId) {
  return call(
    'photo_ocr',
    { action: 'detectBranchFromPhoto', fileId },
    undefined, // 不缓存
    30000
  );
}

/** 简单的图片上传（返回 cloud fileID） */
export function uploadImage(tempFilePath, scene = 'docscan') {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    wx.cloud.uploadFile({
      cloudPath: `ocr/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${tempFilePath.split('.').pop()}`,
      filePath: tempFilePath,
      success: (res) => resolve(res.fileID),
      fail: reject
    });
    // #endif
    // #ifndef MP-WEIXIN
    reject(new Error('当前平台不支持云存储'));
    // #endif
  });
}
