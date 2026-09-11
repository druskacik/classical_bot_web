import { concertDataCache } from '../utils/concert-data-cache.js'

export default defineNitroPlugin(nitroApp => {
  const timer = setInterval(() => {
    const namespaces = concertDataCache.snapshot({ reset: true })
    if (Object.keys(namespaces).length) console.info('[server-data-cache]', JSON.stringify(namespaces))
  }, 5 * 60 * 1000)
  timer.unref()
  nitroApp.hooks.hook('close', () => { clearInterval(timer) })
})
