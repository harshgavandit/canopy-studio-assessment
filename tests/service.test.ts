import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newConfiguration, visibleSections } from '../src/catalog.ts'
import { parseCartItem, parseConfiguration } from '../src/contract.ts'
import { createMockCartItem, quoteConfiguration } from '../server/service.ts'

const text = {
  id: 'example', type: 'text', x: .42, y: .61, width: .3, angle: 8,
  text: 'NORTH', color: '#ffffff', font: 'Arial', bold: true,
} as const

test('all variants receive different quotes, with options and decoration charged per unit', () => {
  const base = newConfiguration()
  assert.deepEqual(['5x5', '6.5x6.5', '8x8'].map(variantId =>
    quoteConfiguration({ ...base, variantId }).total), [32900, 41900, 52900])
  assert.equal(quoteConfiguration({ ...base, frame: 'canopy-only' }).total, 46400)
  const config = { ...base, frame: 'lighted', walls: 'back', wallPrint: 'double', halfWalls: 'single', quantity: 2 } as const
  config.panels['front-roof'].layers.push(text)
  const quote = quoteConfiguration(config)
  assert.equal(visibleSections(config).length, 11)
  assert.equal(quote.unitAmount, 52900 + 9500 + 7900 + 3500 + 10900 + 1200)
  assert.equal(quote.total, quote.unitAmount * 2)
  assert.deepEqual(quote.lines.map(line => line.id), ['variant', 'lighted-frame', 'side-walls', 'half-walls', 'printing'])
})

test('side walls and half walls combine like the reference store, except with three full walls', () => {
  const config = newConfiguration()
  const ids = (value: object) => visibleSections({ ...config, ...value }).filter(s => s.kind === 'wall').map(s => s.id)
  assert.deepEqual(ids({ walls: 'back' }), ['back-wall'])
  assert.deepEqual(ids({ halfWalls: 'double' }), ['left-wall', 'right-wall'])
  assert.deepEqual(ids({ walls: 'back', halfWalls: 'single' }), ['back-wall', 'left-wall', 'right-wall'])
  assert.deepEqual(ids({ walls: 'three' }), ['back-wall', 'left-wall', 'right-wall'])
  assert.throws(() => quoteConfiguration({ ...config, walls: 'three', halfWalls: 'single' }), /valid tent configuration/)
  const single = quoteConfiguration({ ...config, walls: 'three' }).total
  assert.equal(quoteConfiguration({ ...config, walls: 'three', wallPrint: 'double' }).total - single, 9900)
})

test('hidden walls preserve their art without adding a print charge', () => {
  const config = newConfiguration()
  config.panels['back-wall'].layers.push(text)
  assert.equal(quoteConfiguration(config).total, 52900)
  config.walls = 'back'
  assert.equal(quoteConfiguration(config).total, 62000)
})

test('version 1 drafts migrate to the separate wall and half-wall options', () => {
  const { wallPrint, halfWalls, ...rest } = newConfiguration()
  void wallPrint; void halfWalls
  const half = parseConfiguration({ ...rest, version: 1, walls: 'half', doubleSided: true })
  assert.deepEqual([half.walls, half.halfWalls], ['none', 'double'])
  const back = parseConfiguration({ ...rest, version: 1, walls: 'back', doubleSided: false })
  assert.deepEqual([back.walls, back.wallPrint, back.halfWalls], ['back', 'single', 'none'])
})

test('cart recalculates prices and passes configuration, price and proof to Shopify lines', () => {
  const config = newConfiguration()
  config.panels['front-roof'].layers.push(text)
  config.panels['front-valance'].layers.push({ ...text, id: 'second' })
  config.walls = 'back'
  config.quantity = 3
  const quote = quoteConfiguration(config)
  assert.throws(() => createMockCartItem({ configuration: { ...config, quantity: 2 }, quoteId: quote.id }), /quote changed/)
  const item = createMockCartItem({ configuration: config, quoteId: quote.id, total: 1 })
  assert.equal(item.quote.total, quote.total)
  assert.equal(item.proofFile, 'canopy-' + item.id + '.pdf')
  assert.deepEqual(item.configuration, config)
  assert.deepEqual(item.shopify.map(line => [line.merchandiseId, line.quantity]),
    [['mock:canopy-8x8', 3], ['mock:side-walls-back-single', 3], ['mock:decorated-panel', 6]])
  const attributes = Object.fromEntries(item.shopify[0].attributes.map(({ key, value }) => [key, value]))
  assert.equal(attributes._configuration_id, item.id)
  assert.equal(attributes._production_proof, item.proofFile)
  assert.equal(attributes['Side walls'], '1 full side wall, single-sided print')
  assert.equal(attributes._quoted_total, (quote.total / 100).toFixed(2) + ' USD')
  assert.ok(item.shopify.every(line => line.attributes.some(a => a.key === '_configuration_id' && a.value === item.id)))
  assert.deepEqual(parseCartItem(JSON.parse(JSON.stringify(item))), item)
  assert.equal(parseCartItem({ ...item, quote: { total: 'x' } }), undefined)
})

test('malformed placements or artwork are rejected at the request boundary', () => {
  const config = newConfiguration()
  config.panels['front-roof'].layers.push({ ...text, x: Infinity })
  assert.throws(() => parseConfiguration(config), /Invalid artwork/)
  assert.throws(() => parseConfiguration({ ...config, quantity: 0 }), /valid tent configuration/)
})
