import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as Vue from 'vue'

// Mount the actual SFC with a lightweight host so native input/composition
// event sequences can be checked without a browser or database.
const { descriptor } = parse(readFileSync(new URL('../layers/concerts/app/components/filter-autocomplete.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'autocomplete-test', inlineTemplate: true }).content
const executable = compiled.replace(/import \{([^}]+)\} from ["']vue["']/g, (_, names) =>
  `const { ${names.replace(/ as /g, ': ')} } = Vue`,
).replace('export default', 'return')
const renderer = Vue.createRenderer({
  createElement: tag => ({ tag, props: {}, children: [] }),
  createText: text => ({ text }),
  createComment: text => ({ text }),
  setText: (node, text) => { node.text = text },
  setElementText: (node, text) => { node.text = text },
  parentNode: node => node.parent,
  nextSibling: () => null,
  patchProp: (node, key, previous, value) => { node.props[key] = value },
  insert(node, parent) { node.parent = parent; parent.children.push(node) },
  remove(node) { node.parent.children = node.parent.children.filter(child => child !== node) },
})
const find = (node, tag) => node.tag === tag ? node : node.children?.map(child => find(child, tag)).find(Boolean)
const settle = async () => { await Vue.nextTick(); await new Promise(resolve => setTimeout(resolve, 250)); await Vue.nextTick() }

test('search feedback stays pending through debounce and ignores superseded responses', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const requests = []
  const component = new Function('Vue', '$fetch', 'useConcertText', 'document', `
    const { ref, computed, watch, nextTick, useId, onMounted, onUnmounted } = Vue;
    ${executable}
  `)(Vue, (_url, { params }) => new Promise((resolve, reject) => {
    requests.push({ params, resolve, reject })
  }), () => ({ t: text => text, availableOptions: count => `${count} options available` }), {
    addEventListener() {}, removeEventListener() {}, getElementById() {},
  })
  const root = { children: [] }
  const app = renderer.createApp(component, { type: 'city', label: 'City', placeholder: 'Search', modelValue: [] })
  const allText = node => [node.text || '', ...(node.children || []).map(allText)].join(' ')
  const status = node => node.props?.role === 'status' ? node : node.children?.map(status).find(Boolean)
  const flush = async () => { await Promise.resolve(); await Vue.nextTick() }
  const assertPending = () => {
    assert.equal(status(root).text, 'Searching for options.')
    assert.match(allText(root), /Searching…/)
    assert.doesNotMatch(allText(root), /No matching options\./)
  }
  app.mount(root)
  try {
    const input = find(root, 'input')
    input.props.onFocus()
    await flush()
    requests.at(-1).resolve({ items: [] })
    await flush()
    assert.equal(status(root).text, 'No matching options.')

    input.props.onInput({ target: { value: 'Pra' } })
    await flush()
    const countBeforeDebounce = requests.length
    assertPending()
    t.mock.timers.tick(219)
    await flush()
    assert.equal(requests.length, countBeforeDebounce)
    assertPending()
    t.mock.timers.tick(1)
    await flush()
    const oldSearch = requests.at(-1)
    assert.equal(oldSearch.params.q, 'Pra')
    assertPending()

    input.props.onInput({ target: { value: 'Prague' } })
    await flush()
    oldSearch.resolve({ items: [] })
    await flush()
    assertPending()
    t.mock.timers.tick(220)
    await flush()
    requests.at(-1).resolve({ items: [{ value: 'Prague,CZ', label: 'Prague' }] })
    await flush()
    assert.equal(status(root).text, '1 options available')
    assert.doesNotMatch(allText(root), /No matching options\./)

    input.props.onInput({ target: { value: 'unmatched' } })
    await flush()
    assertPending()
    t.mock.timers.tick(220)
    await flush()
    requests.at(-1).resolve({ items: [] })
    await flush()
    assert.equal(status(root).text, 'No matching options.')
    assert.match(allText(root), /No matching options\./)

    input.props.onInput({ target: { value: 'failure' } })
    await flush()
    t.mock.timers.tick(220)
    await flush()
    requests.at(-1).reject(new Error('Unavailable'))
    await flush()
    assert.equal(status(root).text, 'Options could not be loaded. Try again.')
    assert.doesNotMatch(allText(root), /No matching options\./)
  } finally {
    app.unmount()
  }
})

for (const type of ['composer', 'city', 'work', 'area-city']) {
  test(`${type} suggestions update during composition, clear, and ordinary typing`, async () => {
    const requests = []
    const selections = []
    const component = new Function('Vue', '$fetch', 'useConcertText', 'document', `
      const { ref, computed, watch, nextTick, useId, onMounted, onUnmounted } = Vue;
      ${executable}
    `)(Vue, async (_url, { params }) => {
      requests.push({ ...params, endpoint: _url })
      return { items: [{ value: '1', label: 'Mozart' }] }
    }, () => ({ t: text => text, availableOptions: count => String(count) }), {
      addEventListener() {}, removeEventListener() {}, getElementById() {},
    })
    const root = { children: [] }
    const app = renderer.createApp(component, {
      type, label: type, placeholder: 'Search', modelValue: [],
      'onUpdate:modelValue': value => selections.push(value),
    })
    app.mount(root)
    try {
      const input = find(root, 'input')
      input.props.onFocus()
      await Vue.nextTick()
      input.props.onInput({ target: { value: 'Moz' }, isComposing: true })
      await settle()
      assert.equal(requests.at(-1).endpoint, type === 'area-city' ? '/api/get-area-cities' : '/api/get-concert-filter-options')
      assert.equal(requests.at(-1).q, 'Moz', 'search before compositionend or Enter')
      assert.equal(input.props.value, 'Moz')

      const key = (key, extra = {}) => input.props.onKeydown({ key, preventDefault() {}, stopPropagation() {}, ...extra })
      key('ArrowDown')
      key('Enter', { isComposing: true })
      key('Enter', { keyCode: 229 })
      assert.deepEqual(selections, [], 'composition confirmation must not select a suggestion')
      input.props.onCompositionend({ target: { value: 'Mozart' } })
      await settle()
      assert.equal(requests.at(-1).q, 'Mozart')

      input.props.onInput({ target: { value: '' } })
      await settle()
      assert.equal(requests.at(-1).q, undefined, 'clearing restores unfiltered suggestions')
      key('Escape')
      input.props.onInput({ target: { value: 'Bach' } })
      await settle()
      assert.equal(requests.at(-1).q, 'Bach')
      assert.equal(input.props['aria-expanded'], true, 'typing reopens suggestions')
      key('ArrowDown')
      key('Enter')
      assert.deepEqual(selections, [['1']], 'desktop keyboard selection still works')
      await Vue.nextTick()
      assert.equal(input.props.value, '')
    } finally {
      app.unmount()
    }
  })
}
