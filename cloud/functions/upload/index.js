/**
 * upload/index.js - MVP Core: 云存储签名
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function main(params, context) {
  const { action } = params;
  
  if (action === 'signature') {
    return {
      success: true,
      maxFileSize: 20 * 1024 * 1024,
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
    };
  }
}

module.exports = { main };