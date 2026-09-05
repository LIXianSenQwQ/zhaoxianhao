<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { createPinia } from 'pinia';

const pinia = createPinia();
app.use(pinia);

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
	/*每个页面公共css */
</style>
