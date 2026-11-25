import { createHash, randomUUID } from 'node:crypto'
import { variantFor, visibleSections } from '../src/catalog.ts'
import { parseConfiguration, type CartItem, type Quote, type QuoteLine } from '../src/contract.ts'

const prices = { '5x5': 32900, '6.5x6.5': 41900, '8x8': 52900 }
const wallPrices = { none: 0, back: 7900, three: 19900, half: 10900 }
const printPrice = 1200

export function quoteConfiguration(value: unknown): Quote {
  const config = parseConfiguration(value)
  const { variantId, quantity, frame, walls, doubleSided } = config
  const lines: QuoteLine[] = [{
    id: 'variant', label: variantFor(variantId).label + ' canopy',
    unitAmount: prices[variantId] + (frame === 'canopy-only' ? -6500 : 0),
  }]
  if (frame === 'lighted') lines.push({ id: 'lighted-frame', label: 'Lighted frame upgrade', unitAmount: 9500 })
  if (walls !== 'none') {
    lines.push({ id: 'wall-' + walls, label: { back: 'Full rear wall', three: 'Three full walls', half: 'Two half walls' }[walls], unitAmount: wallPrices[walls] })
    if (doubleSided) lines.push({ id: 'two-sided', label: 'Double-sided wall printing', unitAmount: 3500 })
  }
  const decorated = visibleSections(config).filter(({ id }) =>
    config.panels[id].layers.some(layer => layer.type === 'image' || layer.text.trim()),
  ).length
  if (decorated) lines.push({ id: 'printing', label: decorated + (decorated === 1 ? ' decorated panel' : ' decorated panels'), unitAmount: decorated * printPrice })
  const unitAmount = lines.reduce((total, line) => total + line.unitAmount, 0)
  const id = createHash('sha256').update(JSON.stringify({ variantId, frame, walls, doubleSided, lines, quantity, pricingVersion: 1 })).digest('hex').slice(0, 16)
  return { id, currency: 'USD', quantity, unitAmount, total: unitAmount * quantity, lines }
}

export function createMockCartItem(data: unknown): CartItem {
  if (!data || typeof data !== 'object') throw new Error('A tent configuration is required.')
  const input = data as Record<string, unknown>
  const configuration = parseConfiguration(input.configuration)
  const quote = quoteConfiguration(configuration)
  if (input.quoteId !== quote.id) throw new Error('The quote changed. Review the latest total and try again.')
  const id = randomUUID()
  const proofFile = 'canopy-' + id + '.pdf'
  const attributes = [
    { key: '_configuration_id', value: id },
    { key: '_production_proof', value: proofFile },
    { key: '_quote_id', value: quote.id },
    { key: '_quoted_total', value: (quote.total / 100).toFixed(2) + ' USD' },
  ]
  const shopify = [{
    merchandiseId: 'mock:variant:' + configuration.variantId + ':' + configuration.frame,
    quantity: configuration.quantity, attributes,
  }]
  for (const line of quote.lines.filter(line => line.id !== 'variant' && line.id !== 'lighted-frame')) {
    const printing = line.id === 'printing'
    shopify.push({
      merchandiseId: 'mock:add-on:' + line.id,
      quantity: printing ? configuration.quantity * (line.unitAmount / printPrice) : configuration.quantity,
      attributes: [{ key: '_configuration_id', value: id }],
    })
  }
  return { id, createdAt: new Date().toISOString(), configuration, quote, proofFile, shopify }
}
