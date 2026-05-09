import { createPinia } from 'pinia';
import { createApp } from 'vue';
import Notifications from '@kyvg/vue3-notification';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import './assets/styles/main.scss';
import '@vuepic/vue-datepicker/dist/main.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);
app.use(Notifications);

const auth = useAuthStore();
void auth.verify().finally(() => {
  app.mount('#app');
});
