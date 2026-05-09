import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const adminLoginModalOpen = ref(false);
  const redirectAfterLogin = ref<string | null>(null);
  const adminLoginHint = ref<string | null>(null);

  function setLoginModalOpen(open: boolean): void {
    adminLoginModalOpen.value = open;
    if (!open) {
      redirectAfterLogin.value = null;
      adminLoginHint.value = null;
    }
  }

  function openLoginModal(): void {
    redirectAfterLogin.value = null;
    adminLoginHint.value = null;
    adminLoginModalOpen.value = true;
  }

  function requestAdminLogin(redirect: string, hint?: string): void {
    redirectAfterLogin.value = redirect;
    adminLoginHint.value =
      hint ?? 'Чтобы открыть этот раздел, войдите как администратор.';
    adminLoginModalOpen.value = true;
  }

  return {
    adminLoginModalOpen,
    redirectAfterLogin,
    adminLoginHint,
    setLoginModalOpen,
    openLoginModal,
    requestAdminLogin,
  };
});
