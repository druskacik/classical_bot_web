import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { groupConcertWorks } from '../layers/concerts/server/utils/concert-works.js'
import { concertWorkLocation, concertComposerLocation } from '../layers/concerts/app/utils/concert-discovery.js'
import { createConcertText } from '../layers/concerts/app/utils/concert-text.js'

test('programme data is deduplicated, grouped by concert and ordered deterministically', () => {
  const row = (concert, id, title, composer_id = 1, composer_name = 'Bach') => ({ classical_concert_id: concert, id, title, composer_id, composer_name })
  const result = groupConcertWorks([
    row(1, 3, 'Suite'), row(1, 2, 'Concerto'), row(1, 2, 'Concerto'),
    row(1, 4, 'Concerto'), row(2, 7, 'Unknown', null, null), row(1, 9, 'Adagio', 2, 'Mozart'),
  ])
  assert.deepEqual(result.get('1').map(work => work.id), [2, 4, 3, 9])
  assert.deepEqual(result.get('2'), [{ id: 7, title: 'Unknown', composer: null }])
  assert.equal(groupConcertWorks([]).size, 0)
})

test('work navigation preserves route and filters, normalizes IDs and resets pagination', () => {
  const route = { path: '/czechia/prague', query: { works: '02,3', composers: 'Bach', dateFrom: '2026-09-12', page: '4' } }
  assert.deepEqual(concertWorkLocation(route, 2), { path: route.path, query: { works: '2,3', composers: 'Bach', dateFrom: '2026-09-12' } })
  assert.equal(concertWorkLocation(route, 8).query.works, '2,3,8')
  assert.equal(route.query.page, '4')
  assert.equal(concertWorkLocation({ path: '/', query: { works: ['2,3', '4'] } }, 3).query.works, '2,3')
})

const { descriptor } = parse(readFileSync(new URL('../layers/concerts/app/components/concert-programme.vue', import.meta.url), 'utf8'))
const executable = compileScript(descriptor, { id: 'programme-test', inlineTemplate: true }).content
  .replace(/import \{([^}]+)\} from ["']vue["']/g, (_, names) => `const { ${names.replace(/ as /g, ': ')} } = Vue`)
  .replace(/import \{ concertWorkLocation, concertComposerLocation \} from '[^']+'/g, '')
  .replace('export default', 'return')
const renderer = Vue.createRenderer({
  createElement: tag => ({ tag, props: {}, children: [] }),
  createText: text => ({ text }), createComment: () => ({ text: '' }),
  setText: (node, text) => { node.text = text },
  setElementText: (node, text) => { node.text = text; node.children = [] },
  parentNode: node => node.parent, nextSibling: () => null,
  patchProp: (node, key, previous, value) => { node.props[key] = value },
  insert(node, parent, anchor) {
    if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node)
    node.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(node)
    else parent.children.splice(index, 0, node)
  },
  remove(node) { node.parent.children = node.parent.children.filter(child => child !== node) },
})
const all = (node, tag) => [...(node.tag === tag ? [node] : []), ...(node.children || []).flatMap(child => all(child, tag))]
const text = node => (node.text || '') + (node.children || []).map(text).join('')
const works = [
  { id: 2, title: 'Concerto', composer: { id: 1, name: 'Bach' } },
  { id: 3, title: 'Suite', composer: { id: 1, name: 'Bach' } },
  { id: 4, title: 'Adagio', composer: null },
]
for (const locale of ['en-GB', 'sk-SK']) {
  test(`complete programme and composer-only rows (${locale})`, async () => {
    const route = Vue.reactive({ path: '/', fullPath: '/', query: {} })
    const component = new Function('Vue', 'useRoute', 'useConcertText', 'concertWorkLocation', 'concertComposerLocation', `const { ref, computed, watch, useId } = Vue; ${executable}`)(Vue, () => route, () => createConcertText(locale), concertWorkLocation, concertComposerLocation)
    const props = Vue.reactive({ works, composers: [{ id: 1, name: 'Bach' }, { id: 8, name: 'Mozart' }] })
    const root = { children: [] }
    const app = renderer.createApp({ render: () => Vue.h(component, props) })
    app.component('NuxtLink', { props: ['to', 'prefetch'], setup: (props, { slots }) => () => Vue.h('a', { href: props.to.query.works, to: props.to }, slots.default()) })
    app.component('UIcon', { render: () => Vue.h('i') })
    app.mount(root)
    const button = () => all(root, 'button')[0]
    assert.equal(button(), undefined, 'short programmes need no disclosure')
    assert.equal(all(root, 'a').filter(link => link.props['aria-label']).length, 3)
    assert.equal(text(root).split('Bach').length - 1, 1)
    route.query = { works: '2,4' }; route.fullPath = '/?works=2,4'
    await Vue.nextTick()
    assert.equal(all(root, 'a').filter(link => link.props['aria-label']).length, 3)
    assert.equal(text(root).split(createConcertText(locale).t('Matches filter')).length - 1, 2)
    assert.ok(all(root, 'a').some(link => link.props.href === '2,4,3'))
    assert.equal(text(root).split('Mozart').length - 1, 1, 'composer without works remains visible')
    route.query = { works: '2,4', composers: 'Bach', dateFrom: '2026-09-14', page: '3' }
    await Vue.nextTick()
    const composerLink = name => all(root, 'a').find(link => text(link) === name)
    assert.deepEqual(composerLink('Mozart').props.to, { path: '/', query: { works: '2,4', composers: 'Bach,Mozart', dateFrom: '2026-09-14' } })
    assert.equal(composerLink('Bach').props.to.query.composers, 'Bach')
    props.works = Array.from({ length: 7 }, (_, index) => ({ id: index + 10, title: `Work ${index}`, composer: { id: index + 10, name: `Composer ${index}` } }))
    await Vue.nextTick()
    assert.equal(all(root, 'a').filter(link => link.props['aria-label']).length, 7, 'long programmes are fully visible')
    assert.equal(button(), undefined)
    route.query = { works: '16' }; route.fullPath = '/?works=16'
    await Vue.nextTick()
    assert.equal(all(root, 'a').filter(link => link.props['aria-label']).length, 7)
    assert.equal(text(root).split(createConcertText(locale).t('Matches filter')).length - 1, 1)
    props.works = []
    await Vue.nextTick()
    assert.equal(all(root, 'button').length, 0)
    app.unmount()
  })
}
