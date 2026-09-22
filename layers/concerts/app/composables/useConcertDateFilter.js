import { computed, ref, watch, onMounted } from 'vue'
import { concertDatePreset, formatConcertDateRange, resolveConcertDateMode } from '../utils/concert-discovery.js'

// Only the empty custom editor is local state; dates always come from the caller.
export function useConcertDateFilter(dates, update, { locale, t, navigationKey }) {
  const now = ref(null)
  const custom = ref(false)
  onMounted(() => { now.value = new Date() })
  const resetEditor = () => { custom.value = false }
  watch(navigationKey, resetEditor, { flush: 'sync' })
  watch(() => [dates().dateFrom, dates().dateTo, dates().datePreset], resetEditor, { flush: 'sync' })
  const dateMode = computed(() => custom.value ? 'custom'
    : resolveConcertDateMode(dates().datePreset, dates().dateFrom, dates().dateTo, now.value))
  const dateSummary = computed(() => formatConcertDateRange(dates().dateFrom, dates().dateTo, locale, { from: t('From'), until: t('Until') }))
  const selectDateMode = mode => {
    resetEditor()
    now.value = new Date()
    if (mode === 'custom') {
      custom.value = true
      // Opening an empty editor changes no filter and must not reset pagination.
      if (!dates().datePreset) return
      return update({ dateFrom: dates().dateFrom || null, dateTo: dates().dateTo || null, datePreset: null })
    }
    return update({ ...concertDatePreset(mode, now.value), datePreset: mode === 'any' ? null : mode })
  }
  const updateDate = (key, value) => update({ [key]: value || null, datePreset: null })
  return { dateMode, dateSummary, selectDateMode, updateDate, resetEditor }
}
