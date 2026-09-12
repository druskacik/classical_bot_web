import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    content: defineCollection({
      type: 'page',
      source: { include: '**/*.md', exclude: ['blog/**'] },
      schema: z.object({
        eyebrow: z.string(),
        description: z.string(),
      }),
    }),
    blog: defineCollection({
      type: 'page',
      source: 'blog/**/*.md',
      schema: z.object({
        description: z.string(),
        date: z.string(),
      }),
    }),
  },
})
