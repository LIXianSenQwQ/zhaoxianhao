# 部署指南 · 密钥申请与配置（好诚事家风家谱系统）

> 版本：v1.0 · 适用：开发、测试、上线三环境
> 配套：`scripts/setup.js`（一键环境核查）、`packages.json` scripts（dev/build/test）

---

## 一、必需服务账号清单

| 服务 | 用途 | 账号类型 | 关键参数 | 文档链接 |
|---|---|---|---|---|
| **微信小程序** | 登录认证/云函数/存储 | mp.weixin.qq.com | AppID/AppSecret、云开发实例 ID | [微信公众平台](https://mp.weixin.qq.com) |
| **和风天气 API** | 今日天气 + 节气推荐 | dev.qweather.com | KEY（基础版即可，含免费额度） | [和风开发者](https://dev.qweather.com/) |
| **腾讯云短信** | 反向密码/敏感操作验证 | cloud.tencent.com/sms | 签名（短信内容模板）、SDK Key/Secret | [腾讯云短信](https://cloud.tencent.com/product/sms) |
| **内容安全 msgSecCheck** | 动态/相册文本/图像审核 | 云开发内置开启 | 无需手动配置（在小程序云开发控制台开启） | 见下文“开启内容安全” |
| **数据万象 CI** | 图片压缩/水印（可选） | ci.tencent-cloud.com | Bucket 名称、COS SecretId/Key（非必需） | [CI 文档](https://cloud.tencent.com/document/product/454) |
| **媒体处理 MPS** | 视频转码（可选） | mps.tencentcloud.com | Bucket、Key/Secret（非必需） | [MPS 文档](https://cloud.tencent.com/product/mps) |

> ✅ **最低可用组合** = 微信小程序 + 和风天气。短信需用于“反向密码”场景，若仅做 MVP 可后续启用。

---

## 二、微信小程序环境开通步骤

### 2.1 云开发环境准备

1. 登录微信公众平台 → 开发 → 开发管理 → 云开发  
   - 创建环境（建议 `prod` / `test` / `dev`）并记录 **Environment ID**
   - 开通以下服务：
     - **云数据库**（默认集合：users/auth_members/settings/etc.）
     - **云存储**（头像/相册/本地内容）
     - **云函数**（触发器/定时任务）
     - **内容安全**（勾选“启用图文/文字审核”，策略默认或自定义）

### 2.2 获取 OpenID/UnionID

- 用户首次登录调用云函数 `login` 后自动获取 OpenID
- UnionID 仅在绑定开放平台后可用（当前 V1.1 未强制）

---

## 三、服务密钥获取与填写

### 3.1 和风天气 API（必选）

1. 注册账号 → 开通免费版 KEY
2. 在 `pages/index/index.vue` 的 `weatherInfo` 字段中替换：
   ```javascript
   const weatherApiKey = 'YOUR_QWEATHER_KEY'; // 如: abcdef1234567890
   const cityCode = '101280101'; // 赵县城市代码（可自动定位）
   ```
3. 测试命令：`curl "https://devapi.qweather.com/v7/weather/now?location=${cityCode}&key=${weatherApiKey}"`

### 3.2 腾讯云短信（建议但非必须）

1. 腾讯云控制台 → 短信 → 新建签名（格式示例：“郝氏族务通知”）
2. 短信模板（含变量 `${code}`），等待人工审核（通常 1 天）
3. 应用内设置：
   ```javascript
   // cloud/functions/notification/sms/send.js
   const { SdkInput: code } = params; // 6 位验证码
   const templateParams = { appid: 'xxx', template_id: 'xxx' };
   const resp = await wx.cloud.callFunction({ name: 'sms', data: { ...templateParams, code } });
   ```
4. 权限：确保云函数调用的 `cloud-sdk` 有发送短信权限

### 3.3 反向密码功能（可选）

- 反向密码是 V1.1 重要功能：委托人在生前预设未来解密时间
- 实现流程：主密码 + 短信验证码双重解锁
- 如需跳过，可注释掉相关入口并在 `privacy_setting` 中关闭该功能开关

---

## 四、云函数环境变量配置

所有云函数的 `index.js` 可在微信云开发控制台设置环境变量：

| 云函数 | 环境变量 | 说明 |
|---|---|---|
| `login` | `OPEN_ID` | 本例不需要（OpenID 由 wxauth 返回） |
| `auth` | `SECRET` | 鉴权逻辑中使用（V2.0） |
| `notification/sms` | `SMS_APP_ID`, `SMS_TEMPLATE_ID` | 短信发送所需 |
| `upload/image` | `IMAGE_CDN_URL` | CDN 加速地址（若有） |

---

## 五、环境检测脚本运行

在项目根目录运行：
```bash
node scripts/setup.js --install --skip-verify
```
- `--install`：强制安装依赖
- `--skip-verify`：跳过门禁测试（用于快速搭建）

正常输出应包含：
```
✓ Node.js v24.x
✓ npm 10.x
✓ Git x.x.x
→ package-lock.json exists → npm ci
✅ 环境核查通过！
```

---

## 六、启动开发

```bash
# 小程序
npm run dev:mp-wechat

# H5（可选）
npm run dev:h5

# 单元测试
npm test

# 完整门禁
npm run verify
```

---

## 七、常见问题排查

| 问题 | 原因 | 解决方案 |
|---|---|---|
| `wx.cloud.callFunction` 失败 | OPEN_ID/SECRET 未配置 | 在云开发控制台添加环境变量 |
| 天气信息不显示 | KEY 无效或 city 错误 | 检查和风 API 配额是否耗尽，尝试新 KEY |
| 短信发送失败 | 模板/签名未审核 | 等待审核通过后重试 |
| 云函数加载校验报错 | npm install 未完成 | 重新执行 `node scripts/setup.js --install` |

---

## 八、下一步

1. 阅读《隐私政策》与《用户协议》并填写联系人
2. 完成合规签字流程（docs/compliance/README.md）
3. 提交上线前最终验证（check:env + verify + PR review）
