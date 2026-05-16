<script setup lang="ts">
import { computed } from 'vue';

import { avatarInitials, avatarSrc } from '@/utils/userAvatar';

interface Props {
  avatar?: string | null;
  name: string;
  size?: 'sm' | 'md';
}

const props = withDefaults(defineProps<Props>(), {
  size: 'sm',
});

const imageSrc = computed(() => avatarSrc(props.avatar));
const initials = computed(() => avatarInitials(props.name));
</script>

<template>
  <span
    class="user-avatar"
    :class="`user-avatar--${size}`"
    :title="name"
    aria-hidden="true"
  >
    <img
      v-if="imageSrc"
      class="user-avatar__img"
      :src="imageSrc"
      :alt="name"
    />
    <span v-else class="user-avatar__placeholder">{{ initials }}</span>
  </span>
</template>

<style scoped lang="scss">
.user-avatar {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 50%;
  background: var(--surface-muted);
  border: 1px solid var(--border);
}

.user-avatar--sm {
  width: 2rem;
  height: 2rem;
  font-size: 0.7rem;
}

.user-avatar--md {
  width: 3rem;
  height: 3rem;
  font-size: 0.95rem;
}

.user-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-avatar__placeholder {
  font-weight: 700;
  color: var(--muted);
  line-height: 1;
}
</style>
