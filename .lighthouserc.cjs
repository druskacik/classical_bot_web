const profile = process.env.LIGHTHOUSE_PROFILE || 'mobile'
const routePath = process.env.LIGHTHOUSE_PATH || '/'
const port = process.env.LIGHTHOUSE_PORT || '4173'
const baseUrl = `http://127.0.0.1:${port}`

if (!['mobile', 'desktop'].includes(profile)) {
  throw new Error(`Unsupported Lighthouse profile: ${profile}`)
}

module.exports = {
  ci: {
    collect: {
      url: [new URL(routePath, baseUrl).href],
      startServerCommand: 'node .output/server/index.mjs',
      startServerReadyPattern: 'Listening on',
      startServerReadyTimeout: 60_000,
      numberOfRuns: 3,
      chromePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
      settings: {
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        ...(profile === 'desktop' ? { preset: 'desktop' } : {}),
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: `lighthouse-reports/${profile}`,
    },
  },
}
