import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import './assets/styles/main.scss';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

const auth = useAuthStore();
void auth.verify().finally(() => {
  app.mount('#app');
});
