import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'

const origin = process.env.MAP_SITE_URL || 'http://127.0.0.1:3000'
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
})
try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const page = await browser.newPage()
    await page.setViewport({ width, height, hasTouch: width < 768 })
    for (const selection of ['nearLat=52.37&nearLng=4.9&radiusKm=50', 'city=UnknownCity,NL']) {
      const query = `${selection}&bounds=4,52,6,53&dateFrom=2026-10-01&datePreset=custom&composers=Bach`
      await page.goto(`${origin}/map?${query}`, { waitUntil: 'networkidle2' })
      await page.waitForSelector('.leaflet-container')
      const mobile = width < 768
      const container = mobile ? '.panel-header' : '#map-programme'
      await page.waitForFunction(container => [...document.querySelectorAll(`${container} button`)].some(button => button.textContent.trim() === 'Show area' && button.getBoundingClientRect().height > 0), {}, container)
      const text = await page.$eval(container, element => element.textContent)
      assert.ok(text.includes(selection.startsWith('nearLat') ? 'Selected area (50 km radius)' : 'UnknownCity,NL'))
      if (mobile) assert.ok(await page.$('.is-preview'), 'active coordinate searches reveal the mobile programme')
      await page.evaluate(container => [...document.querySelectorAll(`${container} button`)].find(button => button.textContent.trim() === 'Show area').click(), container)
      await page.waitForFunction(() => {
        const query = new URL(location.href).searchParams
        return !query.has('city') && !query.has('nearLat') && !query.has('nearLng') && !query.has('radiusKm')
      })
      const cleared = new URL(page.url()).searchParams
      assert.equal(cleared.get('dateFrom'), '2026-10-01')
      assert.equal(cleared.get('datePreset'), 'custom')
      assert.equal(cleared.get('composers'), 'Bach')
      assert.equal(cleared.get('bounds'), '4,52,6,53')
      const nextProgramme = page.waitForRequest(request => {
        const url = new URL(request.url())
        return url.pathname === '/api/get-concerts' && url.searchParams.has('bounds') && url.searchParams.get('bounds') !== '4,52,6,53'
      })
      const map = await page.$('.leaflet-container')
      await map.focus()
      await page.keyboard.press('ArrowRight')
      const request = new URL((await nextProgramme).url())
      assert.equal(request.searchParams.get('composers'), 'Bach')
      assert.equal(request.searchParams.has('nearLat'), false)
      assert.equal(request.searchParams.has('city'), false)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow')
      console.log(`PASS ${width}×${height}: ${selection} clears and programme follows viewport`)
    }
    await page.close()
  }
} finally { await browser.close() }
