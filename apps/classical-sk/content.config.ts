import { defineCollection, defineContentConfig, z } from '@nuxt/content'
export default defineContentConfig({
  collections: {
    articles: defineCollection({ type: 'page', source: '**/*.md', schema: z.object({ date: z.string().optional() }) }),
  },
})
