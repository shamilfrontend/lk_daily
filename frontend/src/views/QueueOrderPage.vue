<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import draggable from 'vuedraggable';
import { useAppStore } from '@/stores/app';
import { useQueueStore } from '@/stores/queue';
import { useTeamsStore } from '@/stores/teams';
import { useUsersStore } from '@/stores/users';

const teams = useTeamsStore();
const users = useUsersStore();
const queue = useQueueStore();
const app = useAppStore();

const teamId = ref('');
const localIds = ref<string[]>([]);
const error = ref<string | null>(null);

const items = computed({
  get: () => localIds.value.map((id) => ({ id })),
  set: (v: { id: string }[]) => {
    localIds.value = v.map((x) => x.id);
  },
});

const nameById = computed(() => {
  const m = new Map<string, string>();
  for (const u of users.users) {
    m.set(u._id, u.fullName);
  }
  return m;
});

onMounted(async () => {
  await teams.fetchTeams();
  teamId.value = app.selectedTeamId ?? teams.teams[0]?._id ?? '';
});

watch(teamId, async (id) => {
  if (!id) return;
  app.selectedTeamId = id;
  await users.fetchUsers(id, false);
  await queue.loadAll(id, 1);
  localIds.value = [...queue.order];
});

async function save(): Promise<void> {
  error.value = null;
  if (!teamId.value) return;
  try {
    await queue.saveOrder(teamId.value, localIds.value);
  } catch {
    error.value = 'Не удалось сохранить порядок';
  }
}

async function sortAz(): Promise<void> {
  error.value = null;
  if (!teamId.value) return;
  try {
    await queue.sortAlphabetical(teamId.value);
    localIds.value = [...queue.order];
  } catch {
    error.value = 'Не удалось отсортировать';
  }
}
</script>

<template>
  <h1>Настройка очереди</h1>

  <div class="card row">
    <label class="muted" for="tid">Команда</label>
    <select id="tid" v-model="teamId" class="select">
      <option value="" disabled>Выберите команду</option>
      <option v-for="t in teams.teams" :key="t._id" :value="t._id">{{ t.name }}</option>
    </select>
  </div>

  <div v-if="teamId" class="card">
    <p class="muted">Перетаскивайте строки, затем нажмите «Сохранить порядок».</p>
    <p v-if="error" class="error">{{ error }}</p>

    <draggable v-model="items" item-key="id" tag="ol" class="dlist" handle=".handle">
      <template #item="{ element }">
        <li class="ditem">
          <span class="handle" title="Потянуть">⠿</span>
          <span>{{ nameById.get(element.id) ?? element.id }}</span>
        </li>
      </template>
    </draggable>

    <div class="row" style="margin-top: 0.75rem">
      <button type="button" class="btn btn--primary" :disabled="queue.loading" @click="save">Сохранить порядок</button>
      <button type="button" class="btn" :disabled="queue.loading" @click="sortAz">Сортировать по алфавиту</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
h1 {
  margin-top: 0;
}

.dlist {
  margin: 0;
  padding-left: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.ditem {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  padding: 0.55rem 0.65rem;
  border-bottom: 1px solid var(--border);
  background: #121a26;
}

.ditem:last-child {
  border-bottom: none;
}

.handle {
  cursor: grab;
  user-select: none;
  color: var(--muted);
  width: 1.5rem;
  text-align: center;
}
</style>
