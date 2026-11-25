import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newConfiguration, visibleSections } from '../src/catalog.ts'
import { parseConfiguration } from '../src/contract.ts'
import { createMockCartItem, quoteConfiguration } from '../server/service.ts'

const text = {
  id: 'example', type: 'text', x: .42, y: .61, width: .3, angle: 8,
  text: 'NORTH', color: '#ffffff', font: 'Arial', bold: true,
} as const

test('all variants receive different quotes, with options and decoration charged per unit', () => {
  const base = newConfiguration()
  assert.deepEqual(['5x5', '6.5x6.5', '8x8'].map(variantId =>
    quoteConfiguration({ ...base, variantId }).total), [32900, 41900, 52900])
  const config = { ...base, frame: 'lighted', walls: 'half', doubleSided: true, quantity: 2 } as const
  config.panels['front-roof'].layers.push(text)
  const quote = quoteConfiguration(config)
  assert.equal(visibleSections(config).length, 10)
  assert.equal(quote.total, 156000)
  assert.deepEqual(quote.lines.map(line => line.id), ['variant', 'lighted-frame', 'wall-half', 'two-sided', 'printing'])
})

test('hidden walls preserve their art without adding a print charge', () => {
  const config = newConfiguration()
  config.panels['back-wall'].layers.push(text)
  assert.equal(quoteConfiguration(config).total, 52900)
  config.walls = 'back'
  assert.equal(quoteConfiguration(config).total, 62000)
})

test('cart recalculates prices and associates the proof with its configuration', () => {
  const config = newConfiguration()
  config.panels['front-roof'].layers.push(text)
  config.walls = 'back'
  config.quantity = 3
  const quote = quoteConfiguration(config)
  assert.throws(() => createMockCartItem({ configuration: { ...config, quantity: 2 }, quoteId: quote.id }), /quote changed/)
  const item = createMockCartItem({ configuration: config, quoteId: quote.id, total: 1 })
  assert.equal(item.quote.total, quote.total)
  assert.equal(item.proofFile, 'canopy-' + item.id + '.pdf')
  assert.deepEqual(item.configuration, config)
  assert.equal(item.shopify.length, 3)
  assert.equal(item.shopify[0].attributes.find(attribute => attribute.key === '_configuration_id')?.value, item.id)
})

test('malformed placements or artwork are rejected at the request boundary', () => {
  const config = newConfiguration()
  config.panels['front-roof'].layers.push({ ...text, x: Infinity })
  assert.throws(() => parseConfiguration(config), /Invalid artwork/)
  assert.throws(() => parseConfiguration({ ...config, quantity: 0 }), /valid tent configuration/)
})
