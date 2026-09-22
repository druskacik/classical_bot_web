import test from 'node:test'
import assert from 'node:assert/strict'
import { reactive, nextTick } from 'vue'
import { renderer } from '../test-support/vue.js'
import { useConcertQuery } from '../layers/concerts/app/composables/useConcertQuery.js'
import { useConcertDateFilter } from '../layers/concerts/app/composables/useConcertDateFilter.js'
import { createConcertText } from '../layers/concerts/app/utils/concert-text.js'
import { concertDatePreset } from '../layers/concerts/app/utils/concert-discovery.js'

function mount(locale) {
  const route = reactive({ query: {} })
  let state
  const app = renderer.createApp({ setup() {
    const controller = useConcertQuery(route, { push: location => { route.query = location.query } })
    state = useConcertDateFilter(() => controller.query.value, controller.update, {
      locale, t: createConcertText(locale).t, navigationKey: () => route.query,
    })
    return () => null
  } })
  app.mount({ children: [] })
  return { route, state, unmount: () => app.unmount() }
}

for (const locale of ['en-GB', 'sk-SK']) {
  test(`date editor follows presets, manual edits, clear and history (${locale})`, async () => {
    const { route, state, unmount } = mount(locale)
    try {
      route.query = { page: '2' }
      await state.selectDateMode('custom')
      assert.equal(route.query.page, '2', 'opening an editor alone must not navigate')
      assert.equal(state.dateMode.value, 'custom', 'empty custom editor remains open')
      route.query = { composers: 'Bach' }
      assert.equal(state.dateMode.value, 'any', 'navigation clears temporary editor state')
      await state.selectDateMode('today')
      assert.equal(state.dateMode.value, 'today')
      assert.equal(route.query.dateFrom, concertDatePreset('today').dateFrom)
      const saved = { ...route.query }
      await state.selectDateMode('custom')
      assert.equal(state.dateMode.value, 'custom')
      assert.equal(route.query.datePreset, undefined)
      state.updateDate('dateFrom', '2026-10-01')
      assert.equal(route.query.datePreset, undefined)
      route.query = { dateFrom: '2026-10-01' }
      assert.equal(state.dateMode.value, 'custom')
      assert.ok(state.dateSummary.value.length > 0)
      route.query = saved
      assert.equal(state.dateMode.value, 'today', 'back restores preset from dates')
      route.query = {}
      assert.equal(state.dateMode.value, 'any')
      await state.selectDateMode('custom')
      state.resetEditor()
      assert.equal(state.dateMode.value, 'any', 'same-URL clear also closes custom editor')
      for (const preset of ['week', 'weekend', 'any']) {
        await state.selectDateMode(preset)
        assert.equal(state.dateMode.value, preset)
      }
      await nextTick()
    } finally { unmount() }
  })
}
