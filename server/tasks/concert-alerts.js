import db from '../../layers/concerts/server/utils/connection.js'
import { runAlerts } from '../utils/alerts/worker.js'
import { sendMail, mailSettings } from '../utils/mail.js'
import { managementToken } from '../utils/alerts/core.js'
import { classicalBotSite } from '../../site.config.js'
export default defineTask({
  meta: { name: 'concert-alerts', description: 'Send due confirmed concert alerts' },
  async run() {
    if (process.env.NUXT_PUBLIC_ALERTS_ENABLED !== 'true') return { result: { disabled: true } }
    try {
      mailSettings(); managementToken({ id: 0, generation: 0 })
      const hourlyLimit = Number(process.env.ALERTS_HOURLY_LIMIT || 200)
      if (!Number.isSafeInteger(hourlyLimit) || hourlyLimit < 1) throw new Error('Invalid alert budget')
      const result = await runAlerts(db, { send: sendMail, origin: classicalBotSite.origin, hourlyLimit })
      console.info('[alerts] Delivery check', result)
      return { result }
    } catch {
      console.error('[alerts] Delivery check failed')
      return { result: { failed: true } }
    }
  },
})
