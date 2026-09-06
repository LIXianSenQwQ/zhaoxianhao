<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';

onLaunch(() => {
	console.log('App Launch')
});

onShow(() => {
	console.log('App Show')
});

onHide(() => {
	console.log('App Hide')
});
</script>

<style>
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
