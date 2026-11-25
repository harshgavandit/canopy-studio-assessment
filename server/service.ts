import { createHash, randomUUID } from 'node:crypto'
import { isHalfWall, optionSummary, visibleSections } from '../src/catalog.ts'
import { parseConfiguration, type CartItem, type Quote, type QuoteLine, type ShopifyLine } from '../src/contract.ts'

/**
 * Mock price book in integer cents. A real integration would load these from Shopify variant
 * prices or a pricing/CRM API; the quote and cart contracts stay the same.
 */
export const priceBook = {
  version: 2,
  variants: { '5x5': 32900, '6.5x6.5': 41900, '8x8': 52900 },
  canopyOnlyCredit: -6500,
  lightedFrame: 9500,
  walls: { none: 0, back: 7900, three: 19900 },
  doubleSidedWalls: { none: 0, back: 3500, three: 9900 },
  halfWalls: { none: 0, single: 10900, double: 13800 },
  decoratedPanel: 1200,
} as const

export function quoteConfiguration(value: unknown): Quote {
  const config = parseConfiguration(value)
  const { variantId, quantity, frame, walls, wallPrint, halfWalls } = config
  const options = optionSummary(config)
  const canopyOnly = frame === 'canopy-only'
  const lines: QuoteLine[] = [{
    id: 'variant', label: options.Size + ' canopy' + (canopyOnly ? ' (no frame)' : ''),
    sku: 'canopy-' + variantId + (canopyOnly ? '-canopy-only' : ''), units: 1,
    unitAmount: priceBook.variants[variantId] + (canopyOnly ? priceBook.canopyOnlyCredit : 0),
  }]
  if (frame === 'lighted') {
    lines.push({ id: 'lighted-frame', label: 'Lighted frame upgrade', sku: 'lighted-frame', units: 1, unitAmount: priceBook.lightedFrame })
  }
  if (walls !== 'none') {
    lines.push({
      id: 'side-walls', label: options['Side walls'], sku: 'side-walls-' + walls + '-' + wallPrint, units: 1,
      unitAmount: priceBook.walls[walls] + (wallPrint === 'double' ? priceBook.doubleSidedWalls[walls] : 0),
    })
  }
  if (isHalfWall(config, 'left-wall')) {
    lines.push({
      id: 'half-walls', label: 'Half walls (set of 2), ' + halfWalls + '-sided',
      sku: 'half-walls-' + halfWalls, units: 1, unitAmount: priceBook.halfWalls[halfWalls],
    })
  }
  const decorated = visibleSections(config).filter(({ id }) =>
    config.panels[id].layers.some(layer => layer.type === 'image' || layer.text.trim()),
  ).length
  if (decorated) {
    lines.push({
      id: 'printing', label: decorated + (decorated === 1 ? ' decorated panel' : ' decorated panels'),
      sku: 'decorated-panel', units: decorated, unitAmount: decorated * priceBook.decoratedPanel,
    })
  }
  const unitAmount = lines.reduce((total, line) => total + line.unitAmount, 0)
  const id = createHash('sha256')
    .update(JSON.stringify({ lines, quantity, pricingVersion: priceBook.version }))
    .digest('hex').slice(0, 16)
  return { id, currency: 'USD', quantity, unitAmount, total: unitAmount * quantity, lines }
}

/**
 * Re-prices the configuration, rejects stale quotes, and returns Shopify-shaped cart lines.
 * The canopy line carries the options, quote and proof references as line item properties.
 * Keys starting with "_" are hidden in the storefront cart but kept on the order.
 */
export function createMockCartItem(data: unknown): CartItem {
  if (!data || typeof data !== 'object') throw new Error('A tent configuration is required.')
  const input = data as Record<string, unknown>
  const configuration = parseConfiguration(input.configuration)
  const quote = quoteConfiguration(configuration)
  if (input.quoteId !== quote.id) throw new Error('The quote changed. Review the latest total and try again.')
  const id = randomUUID()
  const proofFile = 'canopy-' + id + '.pdf'
  const link = { key: '_configuration_id', value: id }
  const money = (cents: number) => (cents / 100).toFixed(2) + ' ' + quote.currency
  const shopify: ShopifyLine[] = quote.lines.map(line => ({
    merchandiseId: 'mock:' + line.sku,
    quantity: configuration.quantity * line.units,
    attributes: line.id !== 'variant' ? [link] : [
      ...Object.entries(optionSummary(configuration)).map(([key, value]) => ({ key, value })),
      { key: 'Decorated panels', value: String(quote.lines.find(item => item.id === 'printing')?.units ?? 0) },
      link,
      { key: '_production_proof', value: proofFile },
      { key: '_quote_id', value: quote.id },
      { key: '_quoted_unit_price', value: money(quote.unitAmount) },
      { key: '_quoted_total', value: money(quote.total) },
    ],
  }))
  return { id, createdAt: new Date().toISOString(), configuration, quote, proofFile, shopify }
}
