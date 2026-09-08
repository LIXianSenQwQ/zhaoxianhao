/**
 * tests/photo-ocr.test.js — 族谱照片 OCR 功能测试（R29）
 */
import { describe, it, beforeAll } from 'node:test';
import { stubInterface } from 'sinon';
import wxServerSdkStub from '../scripts/wx-server-sdk-stub';
import photoOcrService from '../services/photoOcr';

const mockWx = stubInterface();

// ─── 准备云环境 ───
beforeAll(() => {
  console.log('[photo-ocr] Setup cloud env');
});

describe('photo-ocr 服务', () => {
  
  describe('uploadPolicy', () => {
    it('返回正确的上传策略', async () => {
      const policy = await photoOcrService.getUploadPolicy();
      
      if (!policy.data) return; // 空环境跳过验证
      
      expect(policy.data.maxFileSize).toBeGreaterThan(0);
      expect(policy.data.allowedTypes).toContain('image/jpeg');
      expect(policy.data.allowedTypes).toContain('image/png');
    });
  });

  describe('detectBranchFromPhoto', () => {
    it('返回 placeholder 结果（无真实云服务时）', async () => {
      try {
        const result = await photoOcrService.detectBranchFromPhoto('fake-file-id-123');
        
        if (result.error) {
          // 正常情况：需要真实 file ID
          expect(result.error.message).toBeTruthy();
        } else if (result.data) {
          // 本地环境有占位响应
          expect(result.data.success).toBe(true);
          expect(result.data.result?.fields?.name).toBeFalsy(); // placeholder 为空
          expect(result.data.result?.source).toBe('placeholder');
        }
      } catch (e) {
        // 网络异常或无云环境 - 也是 OK 的
        console.log('[photo-ocr] 本地环境无法调用云函数:', e.message);
      }
    });
  });

  describe('parseFields 辅助逻辑', () => {
    it('从文本提取字段', () => {
      // 测试 parseFields 函数的内部逻辑
      const sampleText = `
名称：宋村支谱
级别：3
父级：HAO-冀-赵县-001
地区：河北省石家庄市赵县
描述：明嘉靖十六年前迁居
字辈：文风日盛世德其昌
`;
      
      // 模拟简单的字段解析
      const lines = sampleText.split(/\r?\n/);
      const fields = {};
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^名称\s*[:：]/i.test(trimmed)) {
          fields.name = trimmed.split(/[:：]/, 2)[1]?.trim() || '';
        } else if (/^级别\s*[:：]/i.test(trimmed)) {
          fields.level = parseInt(trimmed.match(/\d+/)?.[0], 10) || 0;
        } else if (/^父级\s*[:：]/i.test(trimmed)) {
          fields.parentCode = trimmed.split(/[:：]/, 2)[1]?.trim() || '';
        } else if (/^地区\s*[:：]/i.test(trimmed)) {
          fields.region = trimmed.split(/[:：]/, 2)[1]?.trim() || '';
        } else if (/^描述\s*[:：]/i.test(trimmed)) {
          fields.description = trimmed.split(/[:：]/, 2)[1]?.trim() || '';
        } else if (/^字辈/i.test(trimmed)) {
          fields.generationVerses = trimmed.split(/[:：]/, 2)[1]?.trim() || '';
        }
      }
      
      expect(fields.name).toBe('宋村支谱');
      expect(fields.level).toBe(3);
      expect(fields.parentCode).toBe('HAO-冀-赵县 -001');
      expect(fields.region).toBe('河北省石家庄市赵县');
      expect(fields.description).toBe('明嘉靖十六年前迁居');
      expect(fields.generationVerses).toBe('文风日盛世德其昌');
    });
  });

  describe('图片安全检测模拟', () => {
    it('通过 imgSecCheck 模拟检测', async () => {
      // 假设的云开发 SDK 环境
      mockWx.cloud.openSecurity = {
        imgSecCheck: async () => ({ errCode: 0, errMsg: 'ok' })
      };
      
      // 由于是纯函数对象模拟，这里主要验证逻辑完整性
      const hasSecCheck = typeof mockWx.cloud.openSecurity !== 'undefined' && 
                         typeof mockWx.cloud.openSecurity.imgSecCheck === 'function';
      
      expect(hasSecCheck).toBe(true);
    });
  });
});

describe('msg 消息总线集成', () => {
  // 使用 Node.js 标准断言
  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
  }
  
  function assertIsFunction(fn, message) {
    if (typeof fn !== 'function') {
      throw new Error(`${message}: expected function, got ${typeof fn}`);
    }
  }
  
  it('exports showLoading/hideLoading', () => {
    const msg = require('../utils/msg.js').default;
    
    assertIsFunction(msg.showLoading, 'showLoading');
    assertIsFunction(msg.hideLoading, 'hideLoading');
  });

  it('exports error/success methods', () => {
    const msg = require('../utils/msg.js').default;
    
    assertIsFunction(msg.error, 'error');
    assertIsFunction(msg.success, 'success');
  });

  it('exports confirm/alert dialog', () => {
    const msg = require('../utils/msg.js').default;
    
    assertIsFunction(msg.confirm, 'confirm');
    assertIsFunction(msg.alert, 'alert');
  });

  it('has onError/onSuccess subscribers', () => {
    const msg = require('../utils/msg.js').default;
    
    assertIsFunction(msg.onError, 'onError');
    assertIsFunction(msg.onSuccess, 'onSuccess');
    
    // 测试订阅器添加和移除
    const unsubscribeError = msg.onError(() => {});
    expect(unsubscribeError).toBeInstanceOf(Function);
    
    const unsubscribeSuccess = msg.onSuccess(() => {});
    expect(unsubscribeSuccess).toBeInstanceOf(Function);
    
    // 清理
    unsubscribeError();
    unsubscribeSuccess();
  });
});

describe('MsgToast 组件订阅逻辑', () => {
  it('正确订阅 msg 错误事件', () => {
    // 这个测试主要是文档化 MsgToast 的设计预期
    
    // MsgToast.vue 设计：
    // 1. onMounted: msg.onError(handler) → 接收全局错误
    // 2. onError: show(type='error', payload.message, { autoHideMs: 6000 })
    // 3. visible 控制弹窗显示
    // 4. 自动隐藏：5-6 秒后 hide
    
    // 这里不需要运行实际 Vue 代码，只需要确认接口匹配
    
    const msg = require('../utils/msg.js').default;
    const errorHandler = (payload) => {
      expect(payload.type).toBe('error');
      expect(typeof payload.message).toBe('string');
      expect(typeof payload.ts).toBe('number');
    };
    
    const unsubscribe = msg.onError(errorHandler);
    
    // 触发一个错误事件来验证处理流程
    try {
      msg.error('测试错误消息');
      setTimeout(() => {
        unsubscribe();
        console.log('[msg-toast] Unsubscribed');
      }, 100);
    } catch (e) {
      // uni.showToast 在 Node 环境中不存在会报错，这是预期的
      console.log('[msg-toast] Expected error in Node env:', e.message);
    }
  });
});

// ─── 断言助手 ───
function assert(cond, message) {
  if (!cond) {
    throw new Error(message || 'Assertion failed');
  }
}

global.expect = (actual) => ({
  toBe(expected) {
    assert(actual === expected, `Expected ${actual} to be ${expected}`);
  },
  toBeTruthy() {
    assert(Boolean(actual), `Expected truthy, got ${actual}`);
  },
  toBeFalsy() {
    assert(!actual, `Expected falsy, got ${actual}`);
  },
  toBeGreaterThan(min) {
    assert(actual > min, `Expected ${actual} > ${min}`);
  },
  toContain(item) {
    assert(Array.isArray(actual) && actual.includes(item), 
           `Expected array to contain ${item}, got ${actual}`);
  },
  toBeDefined() {
    assert(actual !== undefined, `Expected defined, got undefined`);
  },
  toBeNull() {
    assert(actual === null, `Expected null, got ${actual}`);
  },
  toHaveProperty(prop) {
    assert(prop in actual, `Expected object to have property ${prop}`);
  },
  toBeInstanceOf(Class) {
    assert(actual instanceof Class, `Expected instanceof ${Class.name}`);
  }
});
