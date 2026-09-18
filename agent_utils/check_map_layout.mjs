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
  for (const [width, height] of [[1440, 900], [1440, 700], [1024, 768], [390, 844], [390, 667], [844, 390]]) {
    await page.setViewport({ width, height })
    await page.goto(new URL('/map', origin).href, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.map-concert .sr-only', { timeout: 30000 })
    await page.waitForSelector('.leaflet-container', { timeout: 30000 })
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
    if (width === 390 && height === 667) {
      await page.click('.map-filter-toggle')
      await page.select('.map-toolbar select', 'custom')
      const expanded = await measure()
      assert.equal(expanded.documentHeight, height, 'Custom date filters must not grow the document')
      assert.equal(expanded.mapHeight, result.mapHeight, 'Expanded filters must not collapse the map')
      assert.equal(expanded.programmeHeight, result.programmeHeight, 'Expanded filters must not collapse the list')
      await page.click('.map-filter-toggle')
    }
    console.log(JSON.stringify(result))
  }
} finally {
  await browser.close()
}
