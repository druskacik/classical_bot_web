import test from 'node:test'
import assert from 'node:assert/strict'
import { endpoints, resolveSchema, specification, schemaType } from '../shared/utils/api-documentation.js'
import { fields, parseInput } from '../server/utils/business-api/contract.js'

test('documentation covers every public GET endpoint and resolves every local reference', () => {
  assert.deepEqual(endpoints.map(e => e.path).sort(), Object.keys(specification.paths).filter(path => specification.paths[path].get).sort())
  function walk(value) {
    if (!value || typeof value !== 'object') return
    if (value.$ref) assert.ok(resolveSchema(value))
    Object.values(value).forEach(walk)
  }
  walk(specification)
  assert.deepEqual(Object.keys(specification.components.schemas.Concert.properties), fields)
  for (const field of Object.values(specification.components.schemas.Concert.properties)) assert.ok(field.description)
  for (const endpoint of endpoints) {
    for (const parameter of endpoint.parameters) {
      assert.ok(parameter.name)
      assert.ok(schemaType(parameter.schema))
    }
  }
})
test('concert quickstart example is accepted by the API parser', () => {
  const endpoint = endpoints.find(e => e.id === 'concerts')
  const parsed = parseInput(Object.fromEntries(new URLSearchParams(endpoint.query)))
  assert.equal(parsed.country_code, 'CZ')
  assert.equal(parsed.pageSize, 2)
})
