import { fonts, frames, sections, variants, walls, type Configuration, type Layer } from './catalog.ts'

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

export function parseConfiguration(value: unknown): Configuration {
  if (!isObject(value) || value.version !== 1 || value.productId !== 'canopy' ||
    !variants.some(item => item.id === value.variantId) ||
    !frames.some(item => item.id === value.frame) || !walls.some(item => item.id === value.walls) ||
    typeof value.doubleSided !== 'boolean' || !Number.isInteger(value.quantity) ||
    !inRange(value.quantity, 1, 100) || !isObject(value.panels)) {
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
  const { version, productId, variantId, frame, walls: wallChoice, doubleSided, quantity } = value
  const cleanPanels = Object.fromEntries(sections.map(({ id }) => {
    const panel = panels[id] as Configuration['panels'][typeof id]
    return [id, { color: panel.color, layers: panel.layers.map(layer => {
      const { id, x, y, width, angle } = layer
      return layer.type === 'text'
        ? { id, x, y, width, angle, type: layer.type, text: layer.text, color: layer.color, font: layer.font, bold: layer.bold }
        : { id, x, y, width, angle, type: layer.type, assetId: layer.assetId, name: layer.name, ratio: layer.ratio }
    }) }]
  }))
  return { version, productId, variantId, frame, walls: wallChoice, doubleSided, quantity, panels: cleanPanels } as Configuration
}

export type QuoteLine = { id: string; label: string; unitAmount: number }
export type Quote = {
  id: string; currency: 'USD'; quantity: number; unitAmount: number; total: number; lines: QuoteLine[]
}
export type CartItem = {
  id: string; createdAt: string; configuration: Configuration; quote: Quote; proofFile: string
  shopify: { merchandiseId: string; quantity: number; attributes: { key: string; value: string }[] }[]
}
