<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { CLOUD_ENV_ID } from '@/utils/cloud-env';

// 云开发环境 ID 读取已收口至 utils/cloud-env.ts（SFC 内禁写环境注入表达式，见该文件注释）

onLaunch(() => {
	// #ifdef MP-WEIXIN
	// 初始化微信云开发（云函数均为 wx-server-sdk 编写，只能跑在微信云开发上）
	if (typeof wx !== 'undefined' && wx.cloud) {
		try {
			wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true });
			console.log('[cloud] wx.cloud.init OK, env =', CLOUD_ENV_ID);
		} catch (e) {
			console.warn('[cloud] wx.cloud.init 失败（可能未开通云开发）：', e);
		}
	} else {
		console.warn('[cloud] 当前环境不支持 wx.cloud（仅微信小程序端可用）');
	}
	// #endif
	console.log('App Launch')
});

onShow(() => {
	console.log('App Show')
});

onHide(() => {
	console.log('App Hide')
});
</script>

<style lang="scss">
	/* 全局设计令牌（tokens + home）必须在【非 scoped】样式中引入，
	   否则 :root 会被编译成 .data-v-xxx:root 而失效 → 全站变量丢失白屏 */
	@import '@/styles/tokens.scss';
	@import '@/styles/home.scss';

	/*每个页面公共 css */
	
	/* 通用按钮样式（替代 uview-ui Button 组件）*/
	button.mini-btn {
		font-size: 14px;
		padding: 8px 16px;
		border-radius: 20px;
		border: none;
		margin: 0;
	}
	
	.btn-primary {
		background: #7A9A5F;
		color: #FFF;
	}
	
	.btn-default {
		background: #EEECE4;
		color: #2B2320;
	}
	
	.btn-error, .btn-warn {
		background: #C44D4D;
		color: #FFF;
	}
	
	.btn-info {
		background: #888;
		color: #FFF;
	}
	
	/* 编辑页专用 */
	.btn-edit {
		display: inline-block;
		padding: 10px 20px;
		text-align: center;
		width: auto;
	}
	
	/* 提交按钮专用 */
	.submit-btn {
		display: block;
		padding: 12px 24px;
		text-align: center;
		width: 100%;
	}
	
	/* 详情按钮专用 */
	.btn-detail {
		font-size: 13px;
		padding: 6px 12px;
	}
	
	/* 审核操作按钮组 */
	.act-btn {
		min-width: 70px;
		padding: 8px 16px;
	}
	
	/* 工具栏按钮 */
	.tool-btn {
		flex: 1;
		height: 44px;
		font-size: 15px;
		line-height: 44px;
	}
	
	.export-btn {
		background: #E6A23C;
	}
</style>
