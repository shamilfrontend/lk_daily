<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import draggable from 'vuedraggable';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import { useAppStore } from '@/stores/app';
import { useQueueStore } from '@/stores/queue';
import { useTeamsStore } from '@/stores/teams';
import { useUsersStore } from '@/stores/users';
import { getApiErrorMessage } from '@/utils/apiError';
import { notifyInfo } from '@/composables/useAppNotifications';

const teams = useTeamsStore();
const users = useUsersStore();
const queue = useQueueStore();
const app = useAppStore();

const teamId = ref('');
const localIds = ref<string[]>([]);
const error = ref<string | null>(null);
const subDate = ref('');
const subUserId = ref('');
const subBusy = ref(false);
const swapDateA = ref('');
const swapDateB = ref('');
const swapBusy = ref(false);

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

const onMaternityLeaveIds = computed(() => {
  const s = new Set<string>();
  for (const u of users.users) {
    if (u.onMaternityLeave) {
      s.add(u._id);
    }
  }
  return s;
});

const selectedTeamName = computed(() => teams.teams.find((team) => team._id === teamId.value)?.name ?? '');

onMounted(async () => {
  try {
    await teams.fetchTeams();
    teamId.value = app.selectedTeamId ?? teams.teams[0]?._id ?? '';
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Не удалось загрузить команды');
  }
});

watch(teamId, async (id) => {
  if (!id) return;
  app.selectedTeamId = id;
  error.value = null;
  subDate.value = '';
  subUserId.value = '';
  swapDateA.value = '';
  swapDateB.value = '';
  try {
    await users.fetchUsers(id, false);
    await queue.loadAll(id, 1);
    localIds.value = [...queue.order];
  } catch (e) {
    error.value = users.error ?? queue.error ?? getApiErrorMessage(e, 'Не удалось загрузить очередь');
  }
});

async function save(): Promise<void> {
  error.value = null;
  if (!teamId.value) {
    notifyInfo('Выберите команду для сохранения порядка');
    return;
  }
  try {
    await queue.saveOrder(teamId.value, localIds.value);
  } catch {
    error.value = queue.error ?? 'Не удалось сохранить порядок';
  }
}

async function addSubstitution(): Promise<void> {
  if (!teamId.value || !subDate.value || !subUserId.value) {
    notifyInfo('Заполните дату и участника для подмены');
    return;
  }
  error.value = null;
  subBusy.value = true;
  try {
    await queue.saveSubstitution(teamId.value, subDate.value, subUserId.value);
    subDate.value = '';
    subUserId.value = '';
  } catch (e) {
    error.value = queue.error ?? getApiErrorMessage(e, 'Не удалось сохранить подмену');
  } finally {
    subBusy.value = false;
  }
}

async function removeSubstitutionRow(moscowDate: string): Promise<void> {
  if (!teamId.value) return;
  error.value = null;
  subBusy.value = true;
  try {
    await queue.deleteSubstitution(teamId.value, moscowDate);
  } catch (e) {
    error.value = queue.error ?? getApiErrorMessage(e, 'Не удалось удалить подмену');
  } finally {
    subBusy.value = false;
  }
}

async function swapSubstitutions(): Promise<void> {
  if (!teamId.value || !swapDateA.value || !swapDateB.value) {
    notifyInfo('Выберите обе даты для обмена подменами');
    return;
  }
  error.value = null;
  swapBusy.value = true;
  try {
    await queue.swapSubstitutionDays(teamId.value, swapDateA.value, swapDateB.value);
    swapDateA.value = '';
    swapDateB.value = '';
  } catch (e) {
    error.value = queue.error ?? getApiErrorMessage(e, 'Не удалось поменять подмены');
  } finally {
    swapBusy.value = false;
  }
}

async function sortAz(): Promise<void> {
  error.value = null;
  if (!teamId.value) {
    notifyInfo('Выберите команду для сортировки очереди');
    return;
  }
  try {
    await queue.sortAlphabetical(teamId.value);
    localIds.value = [...queue.order];
  } catch {
    error.value = queue.error ?? 'Не удалось отсортировать';
  }
}
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="Настройка очереди"
      subtitle="Меняй порядок докладчиков вручную, быстро сортируй по алфавиту и сразу сохраняй результат."
    />

    <div class="card">
      <div class="toolbar">
        <div class="field field--grow">
          <label for="tid">Команда</label>
          <select id="tid" v-model="teamId" class="select">
            <option value="" disabled>Выберите команду</option>
            <option v-for="t in teams.teams" :key="t._id" :value="t._id">{{ t.name }}</option>
          </select>
        </div>
        <div class="field field--grow">
          <label>Контекст</label>
          <div class="state-panel state-panel--compact">
            <p class="state-panel__title">{{ selectedTeamName || 'Команда не выбрана' }}</p>
            <p class="state-panel__description">Перетаскивай строки, затем сохрани обновлённый порядок.</p>
          </div>
        </div>
      </div>
    </div>

    <AppState
      v-if="!teamId"
      title="Сначала выбери команду"
      description="После выбора загрузится текущий порядок выступающих."
      tone="empty"
    />

    <div v-else class="card">
      <div class="card-heading">
        <div>
          <h2 class="card-heading__title">Очередь докладчиков</h2>
          <p class="card-heading__subtitle">Зажми маркер слева и перетащи участника на новое место.</p>
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <AppState
        v-if="queue.loading && localIds.length === 0"
        title="Загружаем очередь"
        description="Подтягиваем участников и текущий порядок."
        compact
      />

      <AppState
        v-else-if="localIds.length === 0"
        title="Очередь пока пуста"
        description="Добавь участников в команду или настрой порядок позже."
        tone="empty"
      />

      <template v-else>
        <draggable v-model="items" item-key="id" tag="ol" class="dlist" handle=".handle">
          <template #item="{ element, index }">
            <li class="ditem">
              <div class="ditem__main">
                <span class="handle" title="Потянуть">⠿</span>
                <div>
                  <p class="ditem__position">Позиция {{ index + 1 }}</p>
                  <p class="ditem__name">{{ nameById.get(element.id) ?? element.id }}</p>
                </div>
              </div>
              <div class="ditem__badges">
                <span v-if="onMaternityLeaveIds.has(element.id)" class="badge">в декрете</span>
              </div>
            </li>
          </template>
        </draggable>

        <div class="actions-row queue-actions">
          <button type="button" class="btn btn--primary" :disabled="queue.loading" @click="save">Сохранить порядок</button>
          <button type="button" class="btn" :disabled="queue.loading" @click="sortAz">Сортировать по алфавиту</button>
        </div>
      </template>
    </div>

    <div v-if="teamId" class="card">
      <div class="card-heading">
        <div>
          <h2 class="card-heading__title">Подмена на один день</h2>
          <p class="card-heading__subtitle">
            Укажи дату и участника, который выступит вместо следующего по очереди. Порядок очереди при этом не
            меняется: сдвигается тот, кто был бы докладчиком без подмены.
          </p>
        </div>
      </div>

      <div class="sub-grid">
        <div class="field">
          <label for="sub-date">Дата (Москва)</label>
          <input id="sub-date" v-model="subDate" class="input" type="date" :disabled="subBusy" />
        </div>
        <div class="field field--grow">
          <label for="sub-user">Докладчик</label>
          <select id="sub-user" v-model="subUserId" class="select" :disabled="subBusy">
            <option value="" disabled>Выберите участника</option>
            <option v-for="u in users.users.filter((x) => x.isActive)" :key="u._id" :value="u._id">
              {{ u.fullName }}
            </option>
          </select>
        </div>
        <div class="field field--action">
          <label class="visually-hidden" for="sub-save">Сохранить подмену</label>
          <button id="sub-save" type="button" class="btn btn--primary" :disabled="subBusy || !subDate || !subUserId" @click="addSubstitution">
            Сохранить
          </button>
        </div>
      </div>

      <AppState
        v-if="queue.substitutions.length === 0"
        title="Подмен нет"
        description="Добавь запись, если нужно временно заменить докладчика на конкретную дату."
        tone="empty"
        compact
      />
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Подменяющий</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in queue.substitutions" :key="row.id">
              <td>{{ row.moscowDate }}</td>
              <td>{{ row.substituteFullName || row.substituteUserId }}</td>
              <td class="table-actions">
                <button type="button" class="btn btn--ghost" :disabled="subBusy" @click="removeSubstitutionRow(row.moscowDate)">
                  Удалить
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="sub-grid swap-grid">
        <div class="field">
          <label for="swap-a">Дата A (Москва)</label>
          <input id="swap-a" v-model="swapDateA" class="input" type="date" :disabled="swapBusy" />
        </div>
        <div class="field">
          <label for="swap-b">Дата B (Москва)</label>
          <input id="swap-b" v-model="swapDateB" class="input" type="date" :disabled="swapBusy" />
        </div>
        <div class="field field--action">
          <label class="visually-hidden" for="swap-go">Поменять подмены</label>
          <button
            id="swap-go"
            type="button"
            class="btn"
            :disabled="swapBusy || !swapDateA || !swapDateB"
            @click="swapSubstitutions"
          >
            Поменять докладчиков между датами
          </button>
        </div>
      </div>
      <p class="swap-hint">
        На дате A будет показан докладчик с даты B и наоборот (по прогнозу очереди без учёта уже введённых подмен).
      </p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.dlist {
  margin: 0;
  padding-left: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.ditem {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.9rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
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

.ditem__main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.ditem__position,
.ditem__name {
  margin: 0;
}

.ditem__position {
  color: var(--muted);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ditem__name {
  font-weight: 600;
}

.ditem__badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.4rem;
}

.card-heading {
  margin-bottom: var(--space-3);
}

.card-heading__title,
.card-heading__subtitle {
  margin: 0;
}

.card-heading__subtitle {
  margin-top: 0.35rem;
  color: var(--muted);
}

.queue-success {
  margin: 0 0 var(--space-3);
  color: var(--ok);
  font-weight: 600;
}

.queue-actions {
  margin-top: var(--space-3);
}

.sub-grid {
  display: grid;
  grid-template-columns: minmax(10rem, 14rem) 1fr auto;
  gap: var(--space-3);
  align-items: end;
  margin-bottom: var(--space-3);
}

.swap-grid {
  margin-top: var(--space-4);
  grid-template-columns: minmax(10rem, 14rem) minmax(10rem, 14rem) auto;
}

.swap-hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--muted);
}

.field--action {
  display: flex;
  align-items: flex-end;
}

.table-actions {
  text-align: right;
  width: 8rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.btn--ghost {
  background: transparent;
  border: 1px solid var(--border);
}

@media (max-width: 720px) {
  .ditem {
    flex-direction: column;
    align-items: flex-start;
  }

  .ditem__badges {
    justify-content: flex-start;
  }

  .sub-grid {
    grid-template-columns: 1fr;
  }
}
</style>
