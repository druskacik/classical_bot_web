import test from 'node:test'
import { execFileSync } from 'node:child_process'

const datesUrl = new URL('../layers/concerts/app/utils/concert-dates.js', import.meta.url).href
const discoveryUrl = new URL('../layers/concerts/app/utils/concert-discovery.js', import.meta.url).href
const textUrl = new URL('../layers/concerts/app/utils/concert-text.js', import.meta.url).href

for (const zone of ['America/New_York', 'America/Los_Angeles', 'UTC', 'Europe/Prague', 'Pacific/Kiritimati']) {
  test(`concert calendar dates remain stable in ${zone}`, () => {
    execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict'
      import { concertCalendarDate, createConcertDateFormatting, formatConcertTime, formatConcertDateTime } from ${JSON.stringify(datesUrl)}
      import { formatConcertDateRange, concertDatePreset } from ${JSON.stringify(discoveryUrl)}
      import { createConcertText } from ${JSON.stringify(textUrl)}
      for (const locale of ['en-US', 'en-GB', 'sk-SK']) {
        const { t } = createConcertText(locale)
        const { formatDate, groupByMonth } = createConcertDateFormatting(locale, t('Date unavailable'))
        const sk = locale === 'sk-SK'
        const september = sk ? 'september 2026' : 'September 2026'
        const october = sk ? 'október 2026' : 'October 2026'
        const january = sk ? 'január 2027' : 'January 2027'
        for (const suffix of ['', 'T00:00:00.000Z', 'T00:00:00Z']) {
          const opening = { id: 141795, date: '2026-09-15' + suffix }
          const bell = { id: 156032, date: '2026-09-16' + suffix }
          assert.equal(formatDate(opening.date), sk ? 'utorok 15. septembra' : locale === 'en-US' ? 'Tuesday, September 15' : 'Tuesday 15 September')
          assert.equal(formatDate(bell.date), sk ? 'streda 16. septembra' : locale === 'en-US' ? 'Wednesday, September 16' : 'Wednesday 16 September')
          assert.equal(formatConcertDateTime(opening.date, '19:30:00'), '2026-09-15T19:30')
          assert.equal(formatConcertDateTime(bell.date, '20:00'), '2026-09-16T20:00')
          const undated = { id: 0, date: null }
          const firstOctober = { date: '2026-10-01' + suffix }
          const firstJanuary = { date: '2027-01-01' + suffix }
          const groups = groupByMonth([undated, opening, bell, firstOctober, firstJanuary])
          assert.deepEqual(Object.keys(groups), [september, october, january, t('Date unavailable')])
          assert.deepEqual(groups[september], [opening, bell])
          assert.deepEqual(groups[october], [firstOctober])
          assert.deepEqual(groups[january], [firstJanuary])
          assert.deepEqual(groups[t('Date unavailable')], [undated])
          assert.equal(concertCalendarDate('2028-02-29' + suffix), '2028-02-29')
          assert.equal(concertCalendarDate('2026-02-29' + suffix), null)
        }
        for (const invalid of [null, undefined, '', 'bad', 0, {}, '2026-02-30', '2026-13-01', '2026-00-01', '2026-09-00', '2026-09-15garbage', '2026-09-15T12:00:00Z']) {
          assert.equal(concertCalendarDate(invalid), null)
          assert.equal(formatDate(invalid), t('Date unavailable'))
          assert.equal(formatConcertDateTime(invalid, '19:30'), undefined)
          const concert = { date: invalid }
          assert.deepEqual(groupByMonth([concert]), { [t('Date unavailable')]: [concert] })
        }
        assert.deepEqual(groupByMonth([]), {})
      }
      assert.equal(createConcertText('sk-SK').t('Date unavailable'), 'Dátum nie je k dispozícii')
      assert.equal(formatConcertTime('19:30:00'), '19:30')
      assert.equal(formatConcertTime('20:00'), '20:00')
      for (const time of [null, undefined, '', 'bad', '25:00', '20:99']) {
        assert.equal(formatConcertDateTime('2026-09-15', time), undefined)
      }
      assert.equal(formatConcertDateRange('2026-09-15', '2026-09-16'), '15 Sept 2026 – 16 Sept 2026')
      assert.equal(formatConcertDateRange('bad', null), 'From bad')
      assert.deepEqual(concertDatePreset('today', new Date(2026, 8, 15, 0, 15)), { dateFrom: '2026-09-15', dateTo: '2026-09-15' })
    `], { env: { ...process.env, TZ: zone }, encoding: 'utf8' })
  })
}
