// Read-only integration checks. Start both local apps before running test:sites.
import assert from 'node:assert/strict'

const globalUrl = process.env.GLOBAL_SITE_URL || 'http://localhost:3000'
const slovakUrl = process.env.SLOVAK_SITE_URL || 'http://localhost:3001'
async function request(origin, path, status = 200) {
  const response = await fetch(new URL(path, origin), {
    redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { accept: path.startsWith('/api/') ? 'application/json' : 'text/html' },
  })
  assert.equal(response.status, status, `${origin}${path}`)
  return response
}
const json = async (origin, path) => (await request(origin, path)).json()
const html = async (origin, path, status) => (await request(origin, path, status)).text()

for (const path of ['/', '/Bratislava', '/Tren%C4%8D%C3%ADn', '/Pezinok', '/kontakt', '/zdroje', '/blog', '/blog/o-projekte']) {
  const page = await html(slovakUrl, path)
  assert.match(page, /<html[^>]*lang="sk"/)
  assert.ok(!page.includes('https://classicalbot.com/'), `Wrong canonical origin: ${path}`)
}
for (const path of ['/Praha', '/slovakia/bratislava', '/blog/missing-article']) {
  assert.match(await html(slovakUrl, path, 404), /Stránka sa nenašla/)
}
const redirect = await request(slovakUrl, '/Bratislava?skladatelia=Mozart&dateFrom=2026-10-01', 301)
assert.match(redirect.headers.get('location'), /composers=Mozart/)
assert.match(redirect.headers.get('location'), /dateFrom=2026-10-01/)
const filtered = await html(slovakUrl, '/Bratislava?composers=Mozart')
assert.match(filtered, /<meta name="robots" content="noindex, follow"/)
assert.ok(!filtered.includes('rel="canonical"'))
console.log('Slovak pages, original content route, legacy filters, and SEO: passed')

for (const path of ['/api/get-concerts', '/api/get-concerts?page=2']) {
  const concerts = await json(slovakUrl, path)
  assert.ok(concerts.items.every(concert => concert.country_code === 'SK'))
  assert.ok(concerts.items.every(concert => !concert.city_path?.startsWith('/slovakia/')))
}
for (const path of ['/api/get-concerts?country=CZ', '/api/get-concerts?city=Prague,CZ', '/api/get-composers?country=CZ', '/api/get-concert-filter-options?type=city&country=CZ']) {
  await request(slovakUrl, path, 400)
}
const countries = await json(slovakUrl, '/api/get-countries')
assert.ok(countries.every(country => country.code === 'SK'))
const countryOptions = await json(slovakUrl, '/api/get-concert-filter-options?type=country&selected=CZ')
assert.ok(countryOptions.items.every(country => country.value === 'SK'))
const cities = await json(slovakUrl, '/api/get-concert-filter-options?type=city&selected=Prague,CZ')
assert.ok(cities.items.every(city => city.country_code === 'SK'))
for (const type of ['composer', 'work']) {
  const { items } = await json(slovakUrl, `/api/get-concert-filter-options?type=${type}`)
  if (!items.length) continue // Empty future inventory is valid.
  const value = items[0].value
  const zero = await json(slovakUrl, `/api/get-concert-filter-options?type=${type}&selected=${encodeURIComponent(value)}&dateFrom=2099-01-01`)
  assert.ok(zero.items.some(item => item.value === value && item.count === 0), `${type}: missing selected zero-match label`)
}
const sitemap = await (await request(slovakUrl, '/sitemap.xml')).text()
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1])
// Nuxt's sitemap module uses the local request origin in development mode.
const allowedOrigins = new Set(['https://classical.sk', new URL(slovakUrl).origin])
assert.ok(urls.some(url => new URL(url).pathname === '/blog/o-projekte'))
assert.ok(urls.every(url => allowedOrigins.has(new URL(url).origin) && !url.includes('/slovakia/')))
for (const url of urls) await request(slovakUrl, new URL(url).pathname)
console.log('Slovak listings, pagination, facets, and sitemap scope: passed')

const globalPage = await html(globalUrl, '/')
assert.match(globalPage, /<html[^>]*lang="en"/)
assert.ok(globalPage.includes('https://classicalbot.com/'))
const globalCountries = await json(globalUrl, '/api/get-countries')
assert.ok(globalCountries.some(country => country.code !== 'SK'))
const prague = await json(globalUrl, '/api/get-city-page?country=czechia&city=prague')
await request(slovakUrl, `/api/get-concert-filter-options?type=work&cityId=${prague.id}`, 400)
await request(slovakUrl, '/api/get-city-page?path=/Prague', 404)
const foreignCity = await json(slovakUrl, `/api/get-concerts?city=${prague.id}`)
assert.equal(foreignCity.total, 0)
console.log('Global app remains English and global; foreign city IDs cannot widen Slovak scope: passed')
