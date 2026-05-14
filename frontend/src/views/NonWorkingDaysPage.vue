<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import AppButton from '@/components/UI/AppButton.vue';
import AppPageHeader from '@/components/UI/AppPageHeader.vue';
import AppState from '@/components/UI/AppState.vue';
import ProductionYearCalendar from '@/components/ProductionYearCalendar.vue';
import { useAppStore } from '@/stores/app';
import { useNonWorkingDaysStore } from '@/stores/nonWorkingDays';
import { useTeamsStore } from '@/stores/teams';
import { formatCalendarDateRu } from '@/utils/dates';

const app = useAppStore();
const nwd = useNonWorkingDaysStore();
const teams = useTeamsStore();

const currentYear = ref(new Date().getFullYear());

const selectedTeamRegion = computed(() => {
  if (!app.selectedTeamId) return undefined;
  return teams.teams.find((t) => t._id === app.selectedTeamId)?.region;
});

onMounted(() => {
  void loadYear();
});

watch(
  () => app.selectedTeamId,
  () => {
    void loadYear();
  },
);

async function loadYear(): Promise<void> {
  try {
    await nwd.fetchYear(currentYear.value, app.selectedTeamId ?? undefined);
  } catch {
    /* handled in store */
  }
}

function typeClass(t: string): string {
  if (t === 'federal') return 'badge badge--federal';
  if (t === 'transfer') return 'badge badge--transfer';
  if (t === 'regional') return 'badge badge--regional';
  if (t === 'custom') return 'badge badge--custom';
  return 'badge';
}

function typeLabel(t: string): string {
  if (t === 'federal') return 'Федеральный';
  if (t === 'transfer') return 'Перенос';
  if (t === 'regional') return 'Региональный';
  if (t === 'custom') return 'Пользовательский';
  return t;
}
</script>

<template>
  <section class="page-shell">
    <AppPageHeader
      title="Нерабочие дни"
      :subtitle="
        selectedTeamRegion
          ? `Для выбранной команды учитывается регион ${selectedTeamRegion} вместе с федеральными и пользовательскими днями.`
          : 'Показываем федеральные, переносные и пользовательские дни. Выбери команду, чтобы увидеть региональные даты.'
      "
    />

    <AppState
      v-if="nwd.error"
      title="Не удалось загрузить календарь"
      :description="nwd.error"
      tone="error"
    >
      <template #actions>
        <AppButton type="button" variant="primary" @click="loadYear">Повторить</AppButton>
      </template>
    </AppState>

    <template v-else>
      <div class="card">
        <div class="card-heading">
          <div>
            <h2 class="card-heading__title">
              Визуальный календарь ({{ nwd.year }})
            </h2>
            <p class="card-heading__subtitle">
              Цветом подсвечены федеральные, региональные, пользовательские даты
              и переносы.
            </p>
          </div>
        </div>
        <AppState
          v-if="nwd.loading"
          title="Загружаем календарь"
          description="Подтягиваем нерабочие дни и переносы."
          compact
        />
        <ProductionYearCalendar
          v-else
          :year="nwd.year"
          :items="nwd.items"
          :transfers="nwd.transfers"
        />
      </div>

      <div class="card">
        <div class="card-heading">
          <div>
            <h2 class="card-heading__title">Список дат</h2>
            <p class="card-heading__subtitle">
              Детальная таблица по всем дням, попавшим в календарь.
            </p>
          </div>
        </div>

        <AppState
          v-if="nwd.loading"
          title="Загружаем даты"
          description="Собираем список нерабочих и перенесённых дней."
          compact
        />
        <AppState
          v-else-if="!nwd.items.length"
          title="За этот год записей нет"
          description="Проверь настройки команды или наличие данных в календаре."
          tone="empty"
        />
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Описание</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(it, idx) in nwd.items"
                :key="`${it.date}-${it.type}-${idx}`"
              >
                <td>{{ formatCalendarDateRu(it.date) }}</td>
                <td>
                  <span :class="typeClass(it.type)">{{
                    typeLabel(it.type)
                  }}</span>
                </td>
                <td>{{ it.description ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.card-heading__title,
.card-heading__subtitle {
  margin: 0;
}

.card-heading__subtitle {
  margin-top: 0.35rem;
  color: var(--muted);
}
</style>
