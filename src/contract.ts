import { fonts, frames, halfWalls, prints, sections, variants, walls, type Configuration, type Layer } from './catalog.ts'

const idPattern = /^[a-z0-9-]{1,80}$/i
const colorPattern = /^#[0-9a-f]{6}$/i
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const inRange = (value: unknown, low: number, high: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high
const isColor = (value: unknown) => typeof value === 'string' && colorPattern.test(value)
export const isId = (value: unknown): value is string => typeof value === 'string' && idPattern.test(value)

function isLayer(layer: unknown): layer is Layer {
  if (!isObject(layer) || !isId(layer.id) ||
    !inRange(layer.x, 0, 1) || !inRange(layer.y, 0, 1) ||
    !inRange(layer.width, 0.04, 1.3) || !inRange(layer.angle, -180, 180)) return false
  if (layer.type === 'text') {
    return typeof layer.text === 'string' && layer.text.length <= 100 && isColor(layer.color) &&
      fonts.some(font => font === layer.font) && typeof layer.bold === 'boolean'
  }
  return layer.type === 'image' && isId(layer.assetId) &&
    typeof layer.name === 'string' && layer.name.length <= 160 && inRange(layer.ratio, 0.05, 20)
}

/** Upgrades older saved drafts and cart items. Version 1 treated full and half walls as one choice. */
function migrate(value: Record<string, unknown>): Record<string, unknown> {
  if (value.version !== 1) return value
  const { doubleSided, ...rest } = value
  const print = doubleSided === true ? 'double' : 'single'
  return value.walls === 'half'
    ? { ...rest, version: 2, walls: 'none', wallPrint: 'single', halfWalls: print }
    : { ...rest, version: 2, wallPrint: print, halfWalls: 'none' }
}

export function parseConfiguration(input: unknown): Configuration {
  const value = isObject(input) ? migrate(input) : input
  if (!isObject(value) || value.version !== 2 || value.productId !== 'canopy' ||
    !variants.some(item => item.id === value.variantId) ||
    !frames.some(item => item.id === value.frame) || !walls.some(item => item.id === value.walls) ||
    !prints.some(item => item.id === value.wallPrint) || !halfWalls.some(item => item.id === value.halfWalls) ||
    (value.walls === 'three' && value.halfWalls !== 'none') ||
    !Number.isInteger(value.quantity) || !inRange(value.quantity, 1, 100) || !isObject(value.panels)) {
    throw new Error('Choose a valid tent configuration.')
  }
  const panels = value.panels
  for (const section of sections) {
    const panel = panels[section.id]
    if (!isObject(panel) || !isColor(panel.color) || !Array.isArray(panel.layers) ||
      panel.layers.length > 12 || !panel.layers.every(isLayer) ||
      new Set(panel.layers.map(layer => layer.id)).size !== panel.layers.length) {
      throw new Error('Invalid artwork on ' + section.label + '.')
    }
  }
  const { productId, variantId, frame, walls: wallChoice, wallPrint, halfWalls: halfChoice, quantity } = value
  const cleanPanels = Object.fromEntries(sections.map(({ id }) => {
    const panel = panels[id] as Configuration['panels'][typeof id]
    return [id, { color: panel.color, layers: panel.layers.map(layer => {
      const { id, x, y, width, angle } = layer
      return layer.type === 'text'
        ? { id, x, y, width, angle, type: layer.type, text: layer.text, color: layer.color, font: layer.font, bold: layer.bold }
        : { id, x, y, width, angle, type: layer.type, assetId: layer.assetId, name: layer.name, ratio: layer.ratio }
    }) }]
  }))
  return {
    version: 2, productId, variantId, frame, walls: wallChoice, wallPrint, halfWalls: halfChoice, quantity, panels: cleanPanels,
  } as Configuration
}

/**
 * One priced component of a single tent. `sku` identifies the Shopify product variant that a real
 * adapter would add, and `units` is how many of that variant one tent needs (for example, decorated panels).
 */
export type QuoteLine = { id: string; label: string; sku: string; units: number; unitAmount: number }
export type Quote = {
  id: string; currency: 'USD'; quantity: number; unitAmount: number; total: number; lines: QuoteLine[]
}
/** Mirrors the Shopify Storefront API `CartLineInput` so a real adapter can forward it to `cartLinesAdd`. */
export type ShopifyLine = { merchandiseId: string; quantity: number; attributes: { key: string; value: string }[] }
export type CartItem = {
  id: string; createdAt: string; configuration: Configuration; quote: Quote; proofFile: string; shopify: ShopifyLine[]
}

/** Restores a cart item from browser storage, discarding anything malformed or from an older pricing version. */
export function parseCartItem(value: unknown): CartItem | undefined {
  try {
    if (!isObject(value) || typeof value.id !== 'string' || typeof value.proofFile !== 'string' ||
      !isObject(value.quote) || !Number.isInteger(value.quote.total) || !Array.isArray(value.quote.lines) ||
      !value.quote.lines.every(line => isObject(line) && typeof line.sku === 'string') ||
      !Array.isArray(value.shopify)) return undefined
    return { ...value, configuration: parseConfiguration(value.configuration) } as CartItem
  } catch { return undefined }
}
