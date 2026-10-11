// Public identity of the root application. Other sites provide their own values.
export const classicalBotSite = {
  name: 'ClassicalBot',
  origin: 'https://classicalbot.com',
  subjectDiscovery: true,
}

export const concertSite = { ...classicalBotSite, locale: 'en-GB', country: null, cityRoutes: 'global' }
