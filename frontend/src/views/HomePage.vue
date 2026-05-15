<script setup lang="ts">
import AppButton from '@/components/UI/AppButton.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import { useHomePage } from '@/composables/useHomePage';

const {
  actionError,
  alreadyRecordedHint,
  app,
  auth,
  canAdminAction,
  canRefresh,
  currentTeam,
  headline,
  nonWorkingReason,
  onPresent,
  onSkip,
  pageError,
  presenterSelectionHint,
  queue,
  skipDebtByUserId,
  queueHasOnlyHiddenMembersToday,
  queueSize,
  refresh,
  substitutionHint,
  todayBirthdayNames,
  upcomingBirthdays,
  upcomingBirthdaysNextMonth,
  queueDateByUserId,
  userMap,
  vacationCount,
  visibleQueueMembersToday,
} = useHomePage();
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
    >
      <template #actions>
        <AppButton
          type="button"
          :disabled="!canRefresh"
          @click="refresh"
        >
          Обновить данные
        </AppButton>
      </template>
    </AppPageHeader>

    <AppState
      v-if="!app.selectedTeamId"
      title="Команда не выбрана"
      description="Выбери команду в верхней панели, чтобы открыть дашборд по очереди и рабочим дням."
      tone="empty"
    />

    <template v-else>
      <div class="metric-grid">
        <div class="metric-card">
          <p class="metric-card__label">Команда</p>
          <p class="metric-card__value">
            {{ currentTeam?.name ?? 'Не выбрана' }}
          </p>
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
          <AppButton type="button" variant="primary" @click="refresh">Повторить</AppButton>
        </template>
      </AppState>

      <div v-else class="split-card">
        <div class="left-column">
          <div class="card hero-card">
            <p class="hero-card__label">Сегодня показывает</p>
            <p class="hero-card__title">{{ headline }}</p>
            <p v-if="nonWorkingReason" class="hero-card__reason">
              {{ nonWorkingReason }}
            </p>
            <p
              v-if="substitutionHint"
              class="hero-card__reason hero-card__reason--muted"
            >
              {{ substitutionHint }}
            </p>
            <p
              v-else-if="presenterSelectionHint"
              class="hero-card__reason hero-card__reason--muted"
            >
              {{ presenterSelectionHint }}
            </p>
            <p
              v-if="auth.isAdmin"
              class="hero-card__reason hero-card__reason--muted hero-card__admin-hint"
            >
              Пропустить не закрывает день. Выступил фиксирует созвон.
            </p>
            <p v-if="actionError" class="error">{{ actionError }}</p>
            <p
              v-if="alreadyRecordedHint"
              class="hero-card__reason hero-card__reason--muted"
            >
              За сегодня для этой команды отметка уже сделана.
            </p>
            <div v-if="auth.isAdmin" class="actions-row">
              <AppButton
                type="button"
                variant="primary"
                :disabled="!canAdminAction"
                @click="onPresent"
              >
                Выступил
              </AppButton>
              <AppButton
                type="button"
                :disabled="!canAdminAction"
                @click="onSkip"
              >
                Пропустить
              </AppButton>
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
                <h2 class="card-heading__title">Ближайщие дни рождения</h2>
              </div>
            </div>

            <p
              v-for="fullName in todayBirthdayNames"
              :key="fullName"
              class="hero-card__reason birthday-today-text"
            >
              Сегодня день рождения у {{ fullName }}
            </p>

            <AppState
              v-if="upcomingBirthdays.length === 0"
              title="Нет дней рождения в ближайший месяц"
              description="Добавь даты рождения участникам, чтобы видеть напоминания."
              compact
              tone="empty"
            />
            <p
              v-else-if="upcomingBirthdaysNextMonth.length === 0"
              class="hero-card__reason hero-card__reason--muted"
            >
              В ближайшие 30 дней дней рождения нет.
            </p>
            <ul v-else class="birthday-list">
              <li
                v-for="item in upcomingBirthdaysNextMonth"
                :key="item.userId"
                class="birthday-list__item"
              >
                <span>{{ item.fullName }}</span>
                <span class="badge">{{ item.dayMonth }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="card">
          <div class="card-heading">
            <div>
              <h2 class="card-heading__title">Текущая очередь</h2>
            </div>
          </div>

          <AppState
            v-if="queue.loading"
            title="Загружаем очередь"
            description="Подтягиваем текущего докладчика и список участников."
            compact
          />
          <AppState
            v-else-if="queue.queueMembers.length === 0"
            title="Очередь пока не настроена"
            description="Добавь участников и сформируй порядок в административном разделе."
            tone="empty"
            compact
          />
          <AppState
            v-else-if="queueHasOnlyHiddenMembersToday"
            title="Некого показать в очереди"
            description="Все участники сейчас вне ротации, в отпуске, в декрете или на больничном. Полный порядок и флаги — в разделе настройки очереди."
            tone="empty"
            compact
          />
          <ol v-else class="queue">
            <li
              v-for="m in visibleQueueMembersToday"
              :key="m.userId"
              class="queue__item"
            >
              <div class="queue__main">
                <p class="queue__name">{{ userMap.get(m.userId) ?? m.userId }}</p>
                <p class="queue__date">
                  {{ queueDateByUserId.get(m.userId) ?? '—' }}
                </p>
              </div>
              <span
                v-if="(skipDebtByUserId.get(m.userId) ?? 0) > 0"
                class="badge badge--skip-debt"
              >
                пропусков: {{ skipDebtByUserId.get(m.userId) }}
              </span>
            </li>
          </ol>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.card-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
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
  background: linear-gradient(
    135deg,
    rgba(13, 148, 136, 0.08),
    rgba(255, 255, 255, 0.98)
  );
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

.left-column {
  display: grid;
  align-content: start;
}

.birthday-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.6rem;
}

.birthday-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.birthday-today-text {
  color: #d20f39;
}

.queue {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.hero-card__admin-hint {
  font-size: 0.85rem;
}

.badge--skip-debt {
  flex-shrink: 0;
  align-self: flex-start;
}

.queue__item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: 0.25rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.queue__name {
  margin: 0;
  font-weight: 600;
}

.queue__date {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}

@media (max-width: 720px) {
  .queue__item {
    flex-direction: column;
  }
}
</style>
