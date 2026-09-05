/**
 * cloud/functions/auth/login/index.js
 * V2.0 MVP: 微信登录接口
 */

const wx = require('wx-server-sdk');

wx.init({
  env: wx.DYNAMIC_CURRENT_ENV
});

async function main(params, context) {
  const { code } = params;
  
  try {
    // Step 1: 获取微信用户信息
    const wxResult = await wx.cloud.callFunction({
      name: 'wxauth',
      data: { code }
    });
    
    if (!wxResult.result || !wxResult.result.session_key) {
      return {
        success: false,
        error: 'WeChat login failed'
      };
    }
    
    // Step 2: 查询或创建用户记录
    const usersCol = wx.getDatabase().collection('users');
    let user = await usersCol.where({ openid: wxResult.result.openid }).get();
    
    let userId = null;
    
    if (user.data.length > 0) {
      // 现有用户
      userId = user.data[0]._id;
      await usersCol.doc(user.data[0]._id).update({
        data: { lastLoginAt: new Date() }
      });
    } else {
      // 新用户注册
      const newUser = {
        _id: wx.cloud.generateObjectId(),
        openid: wxResult.result.openid,
        nickName: '',
        avatarUrl: '',
        role: 'VISITOR',
        status: 'PENDING',
        privacyDefault: 'L2',
        createdAt: new Date(),
        lastLoginAt: new Date(),
        schemaVersion: 2 // V1.1+ schema version
      };
      
      const addResult = await usersCol.add({ data: newUser });
      userId = addResult._id;
      
      // 记录审计日志
      await wx.getDatabase().collection('audit_logs').add({
        data: {
          userId: userId,
          action: 'register',
          target: 'users',
          detail: 'New user registration',
          time: new Date(),
          ip: context.clientIP
        }
      });
    }
    
    // Step 3: 生成临时凭证
    const token = Buffer.from(JSON.stringify({
      userId,
      openid: wxResult.result.openid,
      exp: Math.floor(Date.now() / 1000) + 7200 // 2 hours
    })).toString('base64');
    
    return {
      success: true,
      token,
      userInfo: {
        id: userId,
        role: user.data[0]?.role || 'VISITOR',
        needCertify: user.data[0]?.status === 'PENDING'
      }
    };
    
  } catch (err) {
    console.error('Login error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

module.exports = { main };
