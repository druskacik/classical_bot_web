import type { RouterConfig } from '@nuxt/schema'
import { useRequestEvent, useState } from '#imports'

export default {
  routes(routes) {
    // Hydrate the same route table in the browser without exposing private config.
    const maintenance = useState('maintenance-mode', () => Boolean(useRequestEvent()?.context.maintenance))
    if (!maintenance.value) return routes

    return [{
      name: 'maintenance',
      path: '/:pathMatch(.*)*',
      component: () => import('./maintenance.vue'),
      meta: { layout: false, maintenance: true },
    }]
  },
} satisfies RouterConfig
