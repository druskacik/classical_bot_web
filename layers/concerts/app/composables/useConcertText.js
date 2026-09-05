import { concertSite } from '#concert-site'
import { createConcertText } from '../utils/concert-text.js'

export const useConcertText = () => createConcertText(concertSite.locale)
