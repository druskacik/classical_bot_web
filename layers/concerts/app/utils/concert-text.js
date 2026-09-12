const slovak = {
  "Date unavailable": "Dátum nie je k dispozícii",
  "Concert filters": "Filtre koncertov",
  "Country": "Krajina",
  "Loading countries…": "Načítavajú sa krajiny…",
  "Countries unavailable": "Krajiny nie sú dostupné",
  "All countries": "Všetky krajiny",
  "No matching countries": "Žiadne vyhovujúce krajiny",
  "Countries could not be loaded.": "Krajiny sa nepodarilo načítať.",
  "Try again": "Skúsiť znova",
  "City": "Mesto",
  "Any city": "Všetky mestá",
  "When": "Kedy",
  "Any upcoming date": "Kedykoľvek",
  "Today": "Dnes",
  "This week": "Tento týždeň",
  "This weekend": "Tento víkend",
  "Custom dates": "Vlastný dátum",
  "From": "Od",
  "To": "Do",
  "Until": "Do",
  "Composer or work": "Skladateľ alebo dielo",
  "Composer": "Skladateľ",
  "Search composers": "Hľadať skladateľov",
  "Work": "Dielo",
  "Search works or composers": "Hľadať diela alebo skladateľov",
  "Clear filters": "Zrušiť filtre",
  "Remove {label} filter": "Odstrániť filter {label}",
  "Change city…": "Zmeniť mesto…",
  "Add another…": "Pridať ďalší…",
  "Options could not be loaded.": "Možnosti sa nepodarilo načítať.",
  "Searching…": "Vyhľadáva sa…",
  "No matching options.": "Žiadne vyhovujúce možnosti.",
  "Options could not be loaded. Try again.": "Možnosti sa nepodarilo načítať. Skúste to znova.",
  "Searching for options.": "Vyhľadávajú sa možnosti.",
  "Work {id}": "Dielo {id}",
  "Updating…": "Aktualizuje sa…",
  "Concerts could not be loaded": "Koncerty sa nepodarilo načítať",
  "Try again, or adjust the selected filters.": "Skúste to znova alebo upravte vybrané filtre.",
  "Retry": "Skúsiť znova",
  "Concert pages": "Stránky koncertov",
  "Previous page": "Predchádzajúca stránka",
  "Next page": "Ďalšia stránka",
  "Page {page}": "Stránka {page}",
  "No upcoming concerts listed in {city}.": "Pre mesto {city} momentálne nie sú uvedené žiadne nadchádzajúce koncerty.",
  "No upcoming concerts match these filters.": "Vybraným filtrom nezodpovedajú žiadne nadchádzajúce koncerty.",
  "Try any date": "Zobraziť všetky dátumy",
  "Remove music filters": "Zrušiť filtre hudby",
  "Browse all concerts": "Zobraziť všetky koncerty",
  "Browse concerts in {country}": "Zobraziť koncerty v krajine {country}",
  "No concerts": "Žiadne koncerty",
  "{total} {concerts} · showing {first}–{last}": "{total} {concerts} · zobrazené {first}–{last}",
  "Discover upcoming classical music concerts in {city}, {country}.": "Prehľad nadchádzajúcich koncertov klasickej hudby: {city}, {country}.",
  " (opens in a new tab)": " (otvorí sa na novej karte)",
  "Visit {source} website": "Navštíviť web {source}"
}

export function createConcertText(locale = 'en-GB') {
  const sk = locale === 'sk-SK'
  const rules = new Intl.PluralRules(sk ? 'sk' : 'en')
  const forms = sk
    ? { concert: ['koncert', 'koncerty', 'koncertov'], filter: ['aktívny filter', 'aktívne filtre', 'aktívnych filtrov'], option: ['možnosť', 'možnosti', 'možností'] }
    : { concert: ['concert', 'concerts', 'concerts'], filter: ['active filter', 'active filters', 'active filters'], option: ['option', 'options', 'options'] }
  const t = (text, values = {}) => (sk ? slovak[text] || text : text).replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''))
  const plural = (kind, count) => forms[kind][{ one: 0, few: 1 }[rules.select(count)] ?? 2]
  const activeFilters = count => `${count} ${plural('filter', count)}`
  const availableOptions = count => sk ? `Dostupné možnosti: ${count}.` : `${count} ${plural('option', count)} available.`
  return { locale, t, plural, activeFilters, availableOptions }
}
