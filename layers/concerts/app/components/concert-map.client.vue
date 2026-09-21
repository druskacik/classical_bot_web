<template>
  <div class="relative h-full min-h-0 bg-gray-100">
    <div ref="container" class="h-full min-h-0 w-full" :aria-label="t('Concert map. Use arrow keys to pan, plus and minus to zoom.')" />
    <div v-if="loading || error" :style="obscuredHeight ? { bottom: `${obscuredHeight + 16}px` } : undefined" class="absolute inset-x-4 bottom-10 z-[500] mx-auto max-w-sm bg-white px-4 py-3 text-sm text-gray-700" role="status">
      <template v-if="error">{{ t('Map tiles could not be loaded.') }} <button type="button" class="min-h-11 px-2 text-primary underline" @click="retry">{{ t('Retry') }}</button></template>
      <template v-else>{{ t('Loading map…') }}</template>
    </div>
  </div>
</template>
<script setup>
import { clusterMapCities, nearestMapLongitude, parseMapBounds, serializeMapBounds } from '../../shared/utils/concert-map.js'
const props = defineProps({ obscuredHeight: { type: Number, default: 0 }, cities: { type: Array, default: () => [] }, bounds: { type: String, default: null }, selected: { type: String, default: null }, focus: { type: Object, default: null } })
const emit = defineEmits(['bounds', 'select'])
const { t, locale } = useConcertText()
const { concertSite } = useAppConfig()
const config = useRuntimeConfig()
const container = ref(null)
const loading = ref(true)
const error = ref(false)
let L, map, markers, tiles, resize, disposed = false, lastBounds = null
let restoringViewport = false
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const currentBounds = () => {
  const b = map.getBounds()
  const wrap = value => ((value + 180) % 360 + 360) % 360 - 180
  return { west: b.getEast() - b.getWest() >= 360 ? -180 : wrap(b.getWest()), south: Math.max(-90, b.getSouth()), east: b.getEast() - b.getWest() >= 360 ? 180 : wrap(b.getEast()), north: Math.min(90, b.getNorth()) }
}
const publishBounds = (restoring = restoringViewport) => {
  if (disposed || !map) return
  lastBounds = serializeMapBounds(currentBounds())
  emit('bounds', lastBounds, { restoring })
}
const fit = value => {
  const b = parseMapBounds(value)
  if (b) {
    restoringViewport = true
    try { map.fitBounds([[b.south, b.west], [b.north, b.east < b.west ? b.east + 360 : b.east]], { animate: false }) }
    finally { restoringViewport = false }
  }
}
const updateMarkerAccess = () => {
  if (!map || !markers) return
  markers.eachLayer(marker => {
    const point = map.latLngToContainerPoint(marker.getLatLng())
    const covered = props.obscuredHeight > 0 && point.y + 22 > map.getSize().y - props.obscuredHeight
    const element = marker.getElement()
    element.tabIndex = covered ? -1 : 0
    if (covered) element.setAttribute('aria-hidden', 'true')
    else element.removeAttribute('aria-hidden')
  })
}
const draw = () => {
  if (!map) return
  const focused = container.value?.contains(document.activeElement) ? document.activeElement?.dataset?.markerKey : null
  markers.clearLayers()
  let restoredFocus = null
  const displayPosition = city => [city.latitude, nearestMapLongitude(city.longitude, map.getCenter().lng)]
  const size = map.getSize()
  const visible = props.cities.filter(city => { const point = map.latLngToContainerPoint(displayPosition(city)); return point.x >= -64 && point.y >= -64 && point.x <= size.x + 64 && point.y <= size.y + 64 })
  const groups = clusterMapCities(visible, city => map.project(displayPosition(city), map.getZoom()), map.getZoom() >= 10 ? 1 : 64)
  for (const group of groups) {
    const single = group.cities.length === 1
    const city = group.cities[0]
    const label = single ? `${city.name}: ${group.count.toLocaleString(locale)} ${t('concerts')}` : t('{cities} cities · {count} concerts. Zoom in.', { cities: group.cities.length, count: group.count.toLocaleString(locale) })
    const element = document.createElement('span')
    element.className = `concert-map-dot${single && city.id === props.selected ? ' is-selected' : ''}${single ? '' : ' is-cluster'}`
    element.textContent = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(group.count)
    const marker = L.marker(displayPosition(group), { title: label, alt: label, keyboard: true, icon: L.divIcon({ html: element, className: 'concert-map-marker', iconSize: [44, 44], iconAnchor: [22, 22] }) })
    const tooltip = document.createElement('span')
    tooltip.textContent = label
    marker.bindTooltip(tooltip, { direction: 'top' })
    marker.on('click', () => {
      if (single) emit('select', city)
      else map.fitBounds(group.cities.map(displayPosition), { padding: [60, 60], maxZoom: Math.min(map.getZoom() + 3, 14), animate: !reduceMotion() })
    })
    marker.addTo(markers)
    const key = group.cities.map(item => item.id).sort().join(',')
    marker.getElement().dataset.markerKey = key
    if (key === focused) restoredFocus = marker.getElement()
  }
  updateMarkerAccess()
  if (focused) (restoredFocus || container.value)?.focus({ preventScroll: true })
}
const focusCity = () => {
  if (!map || !props.focus) return
  const target = [props.focus.latitude, props.focus.longitude]
  if (!Number.isFinite(target[0]) || !Number.isFinite(target[1])) return
  map.setView(target, 10, { animate: !reduceMotion() })
}
const initialize = async () => {
  loading.value = true
  error.value = false
  try {
    const modules = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
    if (disposed) return
    L = modules[0].default
    map = L.map(container.value, { zoomControl: false, worldCopyJump: true, minZoom: 2, maxZoom: 18, scrollWheelZoom: true })
    map.setView(concertSite.country ? [48.7, 19.5] : [30, 10], concertSite.country ? 7 : 2)
    if (props.bounds) fit(props.bounds)
    else if (props.focus) focusCity()
    L.control.zoom({ position: 'topright', zoomInTitle: t('Zoom in'), zoomOutTitle: t('Zoom out') }).addTo(map)
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map)
    markers = L.layerGroup().addTo(map)
    tiles = L.tileLayer(config.public.areaMapTileUrl, { attribution: config.public.areaMapAttribution, maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', keepBuffer: 0 }).addTo(map)
    tiles.on('tileerror', () => { error.value = true; loading.value = false })
    tiles.on('load', () => { loading.value = false })
    map.on('moveend', () => { draw(); publishBounds() })
    resize = new ResizeObserver(() => {
      restoringViewport = true
      try { map?.invalidateSize({ animate: false, debounceMoveend: false }) }
      finally { restoringViewport = false }
    })
    resize.observe(container.value)
    draw()
    publishBounds(true)
  } catch { error.value = true; loading.value = false; resize?.disconnect(); map?.remove(); map = null }
}
const retry = () => { if (tiles && map) { error.value = false; loading.value = true; tiles.redraw() } else initialize() }
watch(() => [props.cities, props.selected], draw)
watch(() => props.focus, focusCity)
watch(() => props.obscuredHeight, updateMarkerAccess)
watch(() => props.bounds, bounds => {
  if (!map) return
  if (!bounds) publishBounds(true)
  else if (bounds !== lastBounds) fit(bounds)
})
onMounted(initialize)
onBeforeUnmount(() => { disposed = true; resize?.disconnect(); map?.remove(); map = null })
</script>
<style>
.concert-map-marker { background: transparent; border: 0; }
.concert-map-dot { display: flex; width: 44px; height: 44px; align-items: center; justify-content: center; border: 1px solid var(--ui-primary); border-radius: 50%; background: white; color: var(--ui-primary); font-family: var(--font-sans); font-size: var(--text-xs); font-weight: 700; font-variant-numeric: tabular-nums; }
.concert-map-dot.is-cluster { background: var(--ui-primary); color: white; border: 2px solid white; }
.concert-map-dot.is-selected { background: var(--color-gray-950); color: white; border-color: white; }
.concert-map-marker:focus-visible { outline: 3px solid var(--color-gray-950); outline-offset: 3px; border-radius: 50%; }
.concert-map-marker:hover { z-index: 1000 !important; }
.concert-map-marker:hover .concert-map-dot { border-width: 3px; }
.leaflet-container { font-family: var(--font-sans); }
</style>
