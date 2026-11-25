export const sections = [
  { id: 'front-roof', label: 'Front roof', side: 0, kind: 'roof' },
  { id: 'right-roof', label: 'Right roof', side: 1, kind: 'roof' },
  { id: 'back-roof', label: 'Back roof', side: 2, kind: 'roof' },
  { id: 'left-roof', label: 'Left roof', side: 3, kind: 'roof' },
  { id: 'front-valance', label: 'Front valance', side: 0, kind: 'valance' },
  { id: 'right-valance', label: 'Right valance', side: 1, kind: 'valance' },
  { id: 'back-valance', label: 'Back valance', side: 2, kind: 'valance' },
  { id: 'left-valance', label: 'Left valance', side: 3, kind: 'valance' },
  { id: 'back-wall', label: 'Back wall', side: 2, kind: 'wall' },
  { id: 'left-wall', label: 'Left wall', side: 3, kind: 'wall' },
  { id: 'right-wall', label: 'Right wall', side: 1, kind: 'wall' },
] as const

export const variants = [
  { id: '5x5', label: '5 × 5 ft', asset: 'Tent_5_5.glb', family: 'compact' },
  { id: '6.5x6.5', label: '6.5 × 6.5 ft', asset: 'Tent 6.5_6.5.glb', family: 'standard' },
  { id: '8x8', label: '8 × 8 ft', asset: 'Tent_8_8.glb', family: 'wide' },
] as const

export const frames = [
  { id: 'standard', label: 'Standard frame' },
  { id: 'canopy-only', label: 'Canopy only' },
  { id: 'lighted', label: 'Lighted frame' },
] as const

export const walls = [
  { id: 'none', label: 'No walls' },
  { id: 'back', label: '1 full wall' },
  { id: 'three', label: '3 full walls' },
  { id: 'half', label: '2 half walls' },
] as const

export const swatches = ['#ed663f', '#f4eee2', '#273853', '#2d5749', '#141a20', '#c6a36b', '#98473b', '#6987a5']
export const fonts = ['Arial', 'Georgia', 'Courier New', 'Verdana'] as const
export type PanelId = typeof sections[number]['id']
export type VariantId = typeof variants[number]['id']
export type Frame = typeof frames[number]['id']
export type Walls = typeof walls[number]['id']
export type Section = typeof sections[number]

export type Placement = { id: string; x: number; y: number; width: number; angle: number }
export type TextLayer = Placement & {
  type: 'text'; text: string; color: string; font: typeof fonts[number]; bold: boolean
}
export type ImageLayer = Placement & { type: 'image'; assetId: string; name: string; ratio: number }
export type Layer = TextLayer | ImageLayer
export type Panel = { color: string; layers: Layer[] }
export type Configuration = {
  version: 1
  productId: 'canopy'
  variantId: VariantId
  frame: Frame
  walls: Walls
  doubleSided: boolean
  quantity: number
  panels: Record<PanelId, Panel>
}

export const product = { id: 'canopy', name: 'Canopy tent', sections, variants, frames, walls } as const
export const catalog = { canopy: product }
export const variantFor = (id: VariantId) => variants.find(item => item.id === id)!
export const sectionFor = (id: PanelId) => sections.find(item => item.id === id)!
export const visibleSections = (config: Configuration) => sections.filter(section => {
  if (section.kind !== 'wall') return true
  if (config.walls === 'three') return true
  if (config.walls === 'back') return section.id === 'back-wall'
  return config.walls === 'half' && section.id !== 'back-wall'
})
export const clamp = (number: number, min: number, max: number) => Math.max(min, Math.min(max, number))

export function newConfiguration(): Configuration {
  const panels = Object.fromEntries<Panel>(sections.map(section => [
    section.id, { color: section.kind === 'roof' ? '#ed663f' : '#d95031', layers: [] },
  ])) as Configuration['panels']
  return {
    version: 1, productId: 'canopy', variantId: '8x8', frame: 'standard', walls: 'none',
    doubleSided: false, quantity: 1, panels,
  }
}
