import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

// Run against a local Nuxt preview with concert data. This catches actual CSS
// overflow that component unit tests and typechecks cannot detect.
const origin = process.env.MAP_SITE_URL || 'http://127.0.0.1:3000'
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
})
try {
  const page = await browser.newPage()
  for (const [width, height] of (process.env.MAP_TILE_FAILURE_ONLY ? [] : [[1440, 900], [1440, 700], [1024, 768], [320, 667], [390, 844], [390, 667], [430, 932], [844, 390]])) {
    await page.setViewport({ width, height, hasTouch: width < 768 || height < 500 })
    await page.goto(new URL('/map', origin).href, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.map-concert .sr-only', { timeout: 30000 })
    await page.waitForSelector('.leaflet-container', { timeout: 30000 })
    await page.addStyleTag({ content: 'nuxt-devtools-frame, #nuxt-devtools-container { display: none !important; }' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(() => { const tiles = [...document.querySelectorAll('.leaflet-tile')]; return tiles.length && tiles.every(tile => tile.complete && tile.naturalWidth > 0 && Number(getComputedStyle(tile).opacity) >= .99) }, { timeout: 30000 })
    if (process.env.MAP_SCREENSHOT_DIR) {
      await mkdir(process.env.MAP_SCREENSHOT_DIR, { recursive: true })
      await page.screenshot({ path: join(process.env.MAP_SCREENSHOT_DIR, `${width}x${height}.png`) })
    }
    await page.evaluate(() => document.fonts.ready)
    const measure = () => page.evaluate(() => {
      const programme = document.querySelector('.map-programme')
      return {
        width: innerWidth, height: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        hasFooter: Boolean(document.querySelector('footer')),
        mapHeight: document.querySelector('.map-stage').getBoundingClientRect().height,
        programmeHeight: programme.clientHeight,
        programmeScrollHeight: programme.scrollHeight,
      }
    })
    const mobile = await page.$('.map-mobile')
    const initial = await measure()
    const url = page.url()
    if (mobile) {
      assert.ok(await page.$('.map-panel.is-explore'), 'Bare map starts in Explore')
      assert.ok(await page.$eval('.map-programme', el => el.inert), 'Collapsed concerts are not focusable')
      await page.click('.panel-toggle')
      await page.waitForSelector(height < 500 ? '.is-read' : '.is-preview')
      if (height >= 500) {
        await page.waitForFunction(() => Math.abs(document.querySelector('.map-panel').getBoundingClientRect().height - Math.max(document.querySelector('.map-workspace').clientHeight * .45, 230)) < 1)
        if (process.env.MAP_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.MAP_SCREENSHOT_DIR, `${width}x${height}-preview.png`) })
        await page.click('.panel-toggle')
      }
      await page.waitForSelector('.is-read')
      await page.waitForFunction(() => {
        const panel = document.querySelector('.map-panel').getBoundingClientRect()
        const workspace = document.querySelector('.map-workspace')
        return Math.abs(panel.height - workspace.clientHeight) < 1
      })
      assert.equal((await measure()).mapHeight, initial.mapHeight, 'Panel must not resize the map')
      assert.equal(page.url(), url, 'Panel must not change the query')
      assert.ok(await page.$eval('.map-stage', el => el.inert), 'Covered map is not focusable')
      if (process.env.MAP_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.MAP_SCREENSHOT_DIR, `${width}x${height}-read.png`) })
    }
    const result = await measure()
    assert.ok(result.documentWidth <= width + 1, `Horizontal overflow: ${JSON.stringify(result)}`)
    assert.equal(result.hasFooter, false, 'Map layout must not render a footer')
    {
      assert.ok(result.documentHeight <= height + 1, `Page exceeds viewport: ${JSON.stringify(result)}`)
      assert.ok(result.mapHeight >= 80 && result.mapHeight <= height, 'Map must remain usable and bounded')
      assert.ok(result.programmeHeight >= 80, 'Programme must retain a usable scrollport')
      assert.ok(result.programmeScrollHeight > result.programmeHeight, 'Use enough concert rows to exercise scrolling')
      await page.evaluate(() => { const list = document.querySelector('.map-programme'); list.scrollTop = list.scrollHeight })
      assert.ok(await page.$eval('.map-programme', list => list.scrollTop > 0), 'Concert list must actually scroll')
      assert.equal((await measure()).documentHeight, result.documentHeight, 'Scrolling the programme must not grow the page')
    }
    await page.evaluate(() => window.scrollTo(0, 10000))
    assert.equal(await page.evaluate(() => scrollY), 0, 'The document must not scroll')
    if (mobile) {
      const scroll = await page.$eval('.map-programme', el => el.scrollTop)
      await page.click('.panel-back')
      await page.click('.panel-toggle')
      if (height >= 500) await page.click('.panel-toggle')
      await page.waitForFunction(() => Math.abs(document.querySelector('.map-panel').getBoundingClientRect().height - document.querySelector('.map-workspace').clientHeight) < 1)
      assert.equal(await page.$eval('.map-programme', el => el.scrollTop), scroll, 'Panel preserves reading position')
      await page.click('.map-filter-toggle')
      await page.waitForSelector('dialog[open]')
      await page.select('.map-toolbar select', 'custom')
      assert.equal(await page.$$eval('dialog input[type="date"]', els => els.length), 2)
      assert.equal((await measure()).mapHeight, initial.mapHeight, 'Filters must not resize map')
      if (process.env.MAP_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.MAP_SCREENSHOT_DIR, `${width}x${height}-filters.png`) })
      await page.keyboard.press('Escape')
      await page.waitForFunction(() => !document.querySelector('dialog').open)
      assert.ok(await page.$eval('.map-filter-toggle', el => el === document.activeElement), 'Closing filters restores focus')
      if (width === 390 && height === 667) {
        await page.click('.panel-back')
        await page.waitForFunction(() => document.querySelector('.map-panel').clientHeight < 100)
        const handle = await page.$eval('.panel-handle', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 1 } })
        await page.mouse.move(handle.x, handle.y)
        await page.mouse.down()
        await page.mouse.move(handle.x, handle.y - 80, { steps: 8 })
        await page.mouse.up()
        await page.waitForSelector('.is-preview')
        await page.click('.panel-back')
        await page.waitForFunction(() => document.querySelector('.map-panel').clientHeight < 100)
        const marker = await page.evaluate(() => {
          const panelTop = document.querySelector('.map-panel').getBoundingClientRect().top
          const stageTop = document.querySelector('.map-stage').getBoundingClientRect().top
          for (const dot of document.querySelectorAll('.concert-map-dot:not(.is-cluster)')) {
            const rect = dot.getBoundingClientRect()
            if (rect.top > stageTop + 70 && rect.bottom < panelTop && rect.left > 0 && rect.right < innerWidth) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
          }
        })
        assert.ok(marker, 'Fixture must include a visible single-city marker')
        await page.mouse.click(marker.x, marker.y)
        await page.waitForFunction(() => new URL(location.href).searchParams.has('mapCity'))
        await page.waitForSelector('.is-preview')
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForSelector('.is-preview')
        assert.ok(new URL(page.url()).searchParams.has('mapCity'), 'City links restore the programme preview')
      }
    }
    console.log(JSON.stringify(result))
  }
  // Exercise tile recovery with a deliberate network failure, not a production outage.
  await page.setViewport({ width: 390, height: 667, hasTouch: true })
  await page.setCacheEnabled(false)
  await page.setRequestInterception(true)
  page.on('request', request => request.url().startsWith('https://tile.openstreetmap.org/') ? request.abort() : request.continue())
  await page.goto(new URL('/map', origin).href, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('.map-stage [role="status"]')?.textContent.includes('Map tiles could not be loaded.'))
  await page.addStyleTag({ content: 'nuxt-devtools-frame, #nuxt-devtools-container { display: none !important; }' })
  for (const state of ['explore', 'preview']) {
    if (state === 'preview') {
      await page.click('.panel-toggle')
      await page.waitForFunction(() => Math.abs(document.querySelector('.map-panel').getBoundingClientRect().height - Math.max(document.querySelector('.map-workspace').clientHeight * .45, 230)) < 1)
    }
    await page.waitForFunction(() => {
      const status = document.querySelector('.map-stage [role="status"]').getBoundingClientRect()
      const panel = document.querySelector('.map-panel').getBoundingClientRect()
      return status.bottom <= panel.top && status.top >= document.querySelector('.map-stage').getBoundingClientRect().top
    })
    assert.ok(await page.$eval('.map-stage [role="status"] button', el => !el.closest('[inert]')), 'Tile retry remains interactive')
    if (process.env.MAP_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.MAP_SCREENSHOT_DIR, `390x667-tile-error-${state}.png`) })
  }
  console.log('Tile failure recovery remains visible above both panel states')

  // The marker data request has its own retry, independent of tiles and programme.
  page.removeAllListeners('request')
  let failMapData = true
  let mapDataRequests = 0
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/get-concert-map') {
      mapDataRequests++
      if (failMapData) return request.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Simulated map-data failure' }) })
    }
    return request.continue()
  })
  await page.goto(new URL('/map', origin).href, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.leaflet-container')
  await page.waitForSelector('.map-panel.is-explore')
  await page.click('.panel-toggle')
  await page.waitForSelector('.map-panel.is-preview')
  await page.click('.map-filter-toggle')
  await page.waitForSelector('dialog[open]')
  await page.select('.map-toolbar select', 'today')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.map-caption button', { visible: true })
  await page.waitForFunction(() => {
    const caption = document.querySelector('.map-caption').getBoundingClientRect()
    const panel = document.querySelector('.map-panel').getBoundingClientRect()
    const map = document.querySelector('.map-stage').getBoundingClientRect()
    return caption.height > 0 && caption.bottom <= panel.top && caption.top >= map.top
  })
  assert.ok(await page.$('.map-panel.is-preview'), 'Map-data failure must preserve Preview')
  const requestsBeforeRetry = mapDataRequests
  failMapData = false
  const recovered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/get-concert-map' && response.ok())
  await page.click('.map-caption button')
  await recovered
  await page.waitForSelector('.map-caption', { hidden: true })
  assert.ok(mapDataRequests > requestsBeforeRetry, 'Retry must refetch marker data')
  assert.ok(await page.$('.map-panel.is-preview'), 'Retry must preserve Preview')
  console.log('Map-data error and Retry remain visible in Preview; Retry restores marker data')
} finally {
  await browser.close()
}
