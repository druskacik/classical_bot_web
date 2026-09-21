import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import { createConcertText } from '../layers/concerts/app/utils/concert-text.js'

// Small in-memory host for component tests; no browser, Nuxt server or database.
export const renderer = Vue.createRenderer({
  createElement: tag => ({ tag, props: {}, children: [] }),
  createText: text => ({ text }), createComment: text => ({ text }),
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

export function compileComponent(path, bindings = {}, { inlineTemplate = false, modules = {} } = {}) {
  const { descriptor } = parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
  const scope = {
    ...Object.fromEntries(['ref', 'computed', 'watch', 'nextTick', 'useId', 'onMounted', 'onUnmounted', 'onBeforeUnmount'].map(key => [key, Vue[key]])),
    useConcertText: () => createConcertText('en-GB'),
    useAppConfig: () => ({ concertSite: {} }),
    useRuntimeConfig: () => ({ public: {} }),
    ...bindings,
    loadModule: name => {
      if (!Object.hasOwn(modules, name)) throw new Error(`Missing test module: ${name}`)
      return Promise.resolve(modules[name])
    },
  }
  const source = compileScript(descriptor, { id: path, inlineTemplate, genDefaultAs: '__component' }).content
    .replace(/import \{([^}]+)\} from ['"]([^'"]+)['"];?/g, (_, names, from) => {
      for (const entry of names.split(',')) {
        const [name, alias = name] = entry.trim().split(/\s+as\s+/)
        const exports = from === 'vue' ? Vue : bindings
        if (!Object.hasOwn(exports, name)) throw new Error(`Missing test import: ${name} from ${from}`)
        scope[alias] = exports[name]
      }
      return ''
    }).replace(/import\((['"])([^'"]+)\1\)/g, (_, quote, name) => `loadModule(${JSON.stringify(name)})`)
  return new Function(...Object.keys(scope), `${source}; return __component`)(...Object.values(scope))
}
