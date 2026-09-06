import App from './App.vue' // CLI 构建下 rollup 不自动补 .vue 扩展名，必须显式

// #ifndef VUE3
import Vue from 'vue'
import './uni.promisify.adaptor'
Vue.config.productionTip = false
App.mpType = 'app'
const app = new Vue({
	...App
})
app.$mount()
// #endif

// #ifdef VUE3
import {
	createSSRApp
} from 'vue'
import { createPinia } from 'pinia';

export function createApp() {
	const pinia = createPinia();
	const app = createSSRApp(App)
	app.use(pinia);
	return {
		app
	}
}
// #endif
