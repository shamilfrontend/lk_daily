<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useQueueStore } from '@/stores/queue';
import { useTeamsStore } from '@/stores/teams';
import { useUsersStore } from '@/stores/users';
import { getApiErrorMessage } from '@/utils/apiError';
import { moscowTodayString, weekdayRu } from '@/utils/dates';

const UPCOMING_DAYS = 7;
const NO_AVAILABLE_PRESENTERS = 'Нет доступных докладчиков';

const app = useAppStore();
const auth = useAuthStore();
const queue = useQueueStore();
const teams = useTeamsStore();
const users = useUsersStore();

const actionError = ref<string | null>(null);
const pageError = ref<string | null>(null);
const exportError = ref<string | null>(null);
const linkCopied = ref(false);
const skipWithoutRotation = ref(false);

const today = moscowTodayString();

const currentTeam = computed(() => teams.teams.find((team) => team._id === app.selectedTeamId) ?? null);

const userMap = computed(() => {
  const m = new Map<string, string>();
  for (const u of users.users) {
    m.set(u._id, u.fullName);
  }
  return m;
});

const onVacationToday = computed(() => new Set(queue.insightsToday?.vacationUserIds ?? []));

const onMaternityLeaveIds = computed(() => new Set(queue.insightsToday?.maternityUserIds ?? []));

const headline = computed(() => {
  const r = queue.current?.result;
  if (!r) return 'Загрузка…';
  if (r.kind === 'non_working') return 'Сегодня нерабочий день, созвона нет';
  if (r.kind === 'no_queue' || r.kind === 'no_available') return NO_AVAILABLE_PRESENTERS;
  return r.user.fullName;
});

const nonWorkingReason = computed(() => {
  const r = queue.current?.result;
  return r?.kind === 'non_working' ? r.reason : null;
});

const substitutionHint = computed(() => {
  const r = queue.current?.result;
  if (r?.kind === 'ok' && r.substitution) {
    return `Подмена вместо ${r.substitution.canonicalFullName}`;
  }
  return null;
});

const canAct = computed(() => {
  if (!auth.isAdmin) return false;
  const r = queue.current?.result;
  if (!r || r.kind !== 'ok') return false;
  if (queue.alreadyRecordedToday) return false;
  return true;
});

const alreadyRecordedHint = computed(() => {
  if (!auth.isAdmin) return false;
  const r = queue.current?.result;
  return Boolean(r && r.kind === 'ok' && queue.alreadyRecordedToday);
});

const queueSize = computed(() => queue.order.length);
const vacationCount = computed(() => onVacationToday.value.size);
const nextPresenterCount = computed(() => queue.upcoming.length);

async function refresh(): Promise<void> {
  actionError.value = null;
  pageError.value = null;
  const tid = app.selectedTeamId;
  if (!tid) return;
  try {
    await Promise.all([queue.loadAll(tid, UPCOMING_DAYS), users.fetchUsers(tid, false)]);
  } catch (e) {
    pageError.value =
      queue.error ?? users.error ?? getApiErrorMessage(e, 'Не удалось обновить главную страницу');
  }
}

watch(
  () => app.selectedTeamId,
  () => {
    void refresh();
  },
  { immediate: true },
);

async function onPresent(): Promise<void> {
  const tid = app.selectedTeamId;
  if (!tid) return;
  try {
    await queue.present(tid);
  } catch (e: unknown) {
    actionError.value = getApiErrorMessage(e, 'Не удалось отметить выступление');
  }
}

async function onSkip(): Promise<void> {
  const tid = app.selectedTeamId;
  if (!tid) return;
  try {
    await queue.skip(tid, { rotate: !skipWithoutRotation.value });
  } catch (e: unknown) {
    actionError.value = getApiErrorMessage(e, 'Не удалось пропустить участника');
  }
}

function formatUpcomingPresenter(row: { presenter?: { fullName: string } | null }): string {
  return row.presenter?.fullName ?? NO_AVAILABLE_PRESENTERS;
}

function downloadUpcomingCsv(): void {
  exportError.value = null;
  if (queue.upcoming.length === 0) {
    exportError.value = 'Нет данных для экспорта';
    return;
  }

  const rows = [
    ['Дата', 'День недели', 'Докладчик'],
    ...queue.upcoming.map((row) => [
      row.moscowDate,
      weekdayRu(row.moscowDate),
      formatUpcomingPresenter(row),
    ]),
  ];

  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(','),
    )
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const teamSlug = currentTeam.value?.name?.trim().replaceAll(/\s+/g, '-').toLowerCase() || 'team';
  link.href = url;
  link.download = `lk-daily-${teamSlug}-upcoming.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildApiHref(pathWithQuery: string): string {
  const base = import.meta.env.VITE_API_URL ?? '/api';
  if (base.startsWith('http')) {
    return `${base.replace(/\/$/, '')}${pathWithQuery}`;
  }
  return new URL(`${base.replace(/\/$/, '')}${pathWithQuery}`, window.location.origin).href;
}

function downloadUpcomingIcs(): void {
  exportError.value = null;
  const tid = app.selectedTeamId;
  if (!tid) {
    exportError.value = 'Команда не выбрана';
    return;
  }
  const href = buildApiHref(
    `/queue/upcoming/export/ics?teamId=${encodeURIComponent(tid)}&days=${UPCOMING_DAYS}`,
  );
  const a = document.createElement('a');
  a.href = href;
  a.rel = 'noopener';
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function copyTeamDeepLink(): Promise<void> {
  exportError.value = null;
  const tid = app.selectedTeamId;
  if (!tid) {
    exportError.value = 'Команда не выбрана';
    return;
  }
  try {
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set('teamId', tid);
    await navigator.clipboard.writeText(url.toString());
    linkCopied.value = true;
    window.setTimeout(() => {
      linkCopied.value = false;
    }, 2000);
  } catch {
    exportError.value = 'Не удалось скопировать ссылку';
  }
}
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="Сегодня"
      :subtitle="
        currentTeam
          ? `Команда: ${currentTeam.name}. Здесь собраны текущий докладчик, очередь и прогноз ближайших рабочих дней.`
          : 'Выбери команду в верхней панели, чтобы увидеть текущего докладчика, очередь и прогноз.'
      "
      eyebrow="Dashboard"
    >
      <template #actions>
        <button type="button" class="btn" :disabled="!app.selectedTeamId || queue.loading" @click="refresh">
          Обновить данные
        </button>
      </template>
    </AppPageHeader>

    <AppState
      v-if="!app.selectedTeamId"
      title="Команда не выбрана"
      description="Выбери команду в верхней панели, чтобы открыть дашборд по очереди и рабочим дням."
      tone="empty"
    />

    <template v-else>
      <div class="home-tips card" role="note">
        <p class="home-tips__title">Подсказки</p>
        <ul class="home-tips__list">
          <li>
            <strong>Ссылка на команду.</strong> Кнопка «Ссылка на команду» копирует адрес с параметром
            <code class="home-tips__code">?teamId=…</code> — по нему сразу открывается выбранная команда.
          </li>
          <li>
            <strong>Прогноз и календарь.</strong> Таблица ниже — только рабочие дни по производственному календарю
            (федеральные, региональные и свои исключения). ICS подтягивает прогноз с сервера через API.
          </li>
          <li>
            <strong>Для администратора.</strong> Отметка «Выступил» / «Пропустить» и порядок очереди — в разделах
            «Очередь» и связанных страницах после входа.
          </li>
        </ul>
      </div>

      <div class="metric-grid">
        <div class="metric-card">
          <p class="metric-card__label">Команда</p>
          <p class="metric-card__value">{{ currentTeam?.name ?? 'Не выбрана' }}</p>
        </div>
        <div class="metric-card">
          <p class="metric-card__label">Участников в очереди</p>
          <p class="metric-card__value">{{ queueSize }}</p>
        </div>
        <div class="metric-card">
          <p class="metric-card__label">В отпуске сегодня</p>
          <p class="metric-card__value">{{ vacationCount }}</p>
        </div>
      </div>

      <AppState
        v-if="pageError"
        title="Не удалось загрузить данные"
        :description="pageError"
        tone="error"
      >
        <template #actions>
          <button type="button" class="btn btn--primary" @click="refresh">Повторить</button>
        </template>
      </AppState>

      <div v-else class="split-card">
        <div class="card hero-card">
          <p class="hero-card__label">Сегодня показывает</p>
          <p class="hero-card__title">{{ headline }}</p>
          <p v-if="nonWorkingReason" class="hero-card__reason">{{ nonWorkingReason }}</p>
          <p v-if="substitutionHint" class="hero-card__reason hero-card__reason--muted">{{ substitutionHint }}</p>
          <p class="hero-card__hint">Дата: {{ today }} · Прогнозов на ближайшие дни: {{ nextPresenterCount }}</p>
          <p v-if="actionError" class="error">{{ actionError }}</p>
          <p v-if="alreadyRecordedHint" class="hero-card__reason hero-card__reason--muted">
            За сегодня для этой команды отметка уже сделана.
          </p>
          <div v-if="auth.isAdmin" class="actions-column">
            <label class="skip-rotate-label" :class="{ 'skip-rotate-label--disabled': !canAct || queue.loading }">
              <input v-model="skipWithoutRotation" type="checkbox" :disabled="!canAct || queue.loading" />
              Пропуск без сдвига очереди
            </label>
            <div class="actions-row">
              <button type="button" class="btn btn--primary" :disabled="!canAct || queue.loading" @click="onPresent">
                Выступил
              </button>
              <button type="button" class="btn" :disabled="!canAct || queue.loading" @click="onSkip">Пропустить</button>
            </div>
          </div>
          <AppState
            v-else
            title="Админ-действия недоступны"
            description="Только администратор может отметить выступление или пропустить участника."
            compact
          />
        </div>

        <div class="card">
          <div class="card-heading">
            <div>
              <h2 class="card-heading__title">Текущая очередь</h2>
              <p class="card-heading__subtitle">Отмечаем отпуск и декрет прямо в списке.</p>
            </div>
          </div>

          <AppState
            v-if="queue.loading"
            title="Загружаем очередь"
            description="Подтягиваем текущего докладчика и список участников."
            compact
          />
          <AppState
            v-else-if="queue.order.length === 0"
            title="Очередь пока не настроена"
            description="Добавь участников и сформируй порядок в административном разделе."
            tone="empty"
            compact
          />
          <ol v-else class="queue">
            <li v-for="id in queue.order" :key="id" class="queue__item">
              <div>
                <p class="queue__name">{{ userMap.get(id) ?? id }}</p>
              </div>
              <div class="queue__badges">
                <span v-if="onVacationToday.has(id)" class="badge">в отпуске</span>
                <span v-if="onMaternityLeaveIds.has(id)" class="badge">в декрете</span>
              </div>
            </li>
          </ol>
        </div>
      </div>

      <div v-if="!pageError" class="card">
        <div class="card-heading card-heading--with-actions">
          <div>
            <h2 class="card-heading__title">Ближайшие рабочие дни</h2>
            <p class="card-heading__subtitle">
              В таблице только рабочие дни по производственному календарю с учетом федеральных, региональных и
              пользовательских исключений.
            </p>
          </div>
          <div class="card-heading__btn-row">
            <button type="button" class="btn" :disabled="queue.loading || !app.selectedTeamId" @click="copyTeamDeepLink">
              {{ linkCopied ? 'Ссылка скопирована' : 'Ссылка на команду' }}
            </button>
            <button type="button" class="btn" :disabled="queue.loading" @click="downloadUpcomingCsv">
              Экспорт прогноза (CSV)
            </button>
            <button type="button" class="btn" :disabled="queue.loading || !app.selectedTeamId" @click="downloadUpcomingIcs">
              Календарь (ICS)
            </button>
          </div>
        </div>

        <p v-if="exportError" class="error">{{ exportError }}</p>

        <AppState
          v-if="queue.loading"
          title="Загружаем прогноз"
          description="Собираем ближайшие рабочие даты и очередность выступлений."
          compact
        />
        <AppState
          v-else-if="queue.upcoming.length === 0"
          title="Нет данных для прогноза"
          description="Проверь настройки очереди и рабочие дни для выбранной команды."
          tone="empty"
          compact
        />
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>День недели</th>
                <th>Докладчик</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in queue.upcoming" :key="row.moscowDate">
                <td>{{ row.moscowDate }}</td>
                <td>{{ weekdayRu(row.moscowDate) }}</td>
                <td>
                  {{ formatUpcomingPresenter(row) }}
                  <span v-if="row.substitution" class="table-subhint"
                    >вместо {{ row.substitution.canonicalFullName }}</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.home-tips {
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-muted);
  border: 1px dashed var(--border);
}

.home-tips__title {
  margin: 0 0 var(--space-2);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text);
}

.home-tips__list {
  margin: 0;
  padding-left: 1.25rem;
  display: grid;
  gap: 0.65rem;
  font-size: 0.9rem;
  color: var(--muted);
  line-height: 1.45;
}

.home-tips__list strong {
  color: var(--text);
  font-weight: 600;
}

.home-tips__code {
  font-size: 0.85em;
  padding: 0.1rem 0.35rem;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
}

.card-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.card-heading--with-actions {
  flex-wrap: wrap;
}

.card-heading__title,
.card-heading__subtitle {
  margin: 0;
}

.card-heading__title {
  font-size: 1.05rem;
}

.card-heading__subtitle {
  margin-top: 0.35rem;
  color: var(--muted);
}

.hero-card {
  display: grid;
  gap: var(--space-3);
  align-content: start;
  background: linear-gradient(135deg, rgba(13, 148, 136, 0.08), rgba(255, 255, 255, 0.98));
}

.hero-card__label,
.hero-card__title,
.hero-card__hint {
  margin: 0;
}

.hero-card__label {
  color: var(--accent-hover);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: var(--font-size-xs);
}

.hero-card__title {
  font-size: clamp(1.8rem, 3vw, 2.4rem);
  font-weight: 800;
  line-height: 1.05;
}

.hero-card__hint {
  color: var(--muted);
}

.hero-card__reason {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}

.hero-card__reason--muted {
  font-weight: 500;
  color: var(--muted);
  font-size: 0.95rem;
}

.table-subhint {
  display: block;
  margin-top: 0.2rem;
  font-size: var(--font-size-xs);
  color: var(--muted);
}

.card-heading__btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
}

.actions-column {
  display: grid;
  gap: var(--space-2);
}

.skip-rotate-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--muted);
  cursor: pointer;
}

.skip-rotate-label--disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.queue {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.queue__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 0.9rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.queue__name {
  margin: 0;
  font-weight: 600;
}

.queue__badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.4rem;
}

@media (max-width: 720px) {
  .queue__item {
    flex-direction: column;
    align-items: flex-start;
  }

  .queue__badges {
    justify-content: flex-start;
  }
}
</style>
