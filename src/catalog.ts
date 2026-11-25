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
  { id: 'none', label: 'No side walls' },
  { id: 'back', label: '1 full side wall' },
  { id: 'three', label: '3 full side walls' },
] as const

export const prints = [
  { id: 'single', label: 'Single-sided print' },
  { id: 'double', label: 'Double-sided print' },
] as const

export const halfWalls = [
  { id: 'none', label: 'No half walls' },
  { id: 'single', label: 'Half walls (set of 2), single-sided' },
  { id: 'double', label: 'Half walls (set of 2), double-sided' },
] as const

export const swatches = ['#ed663f', '#f4eee2', '#273853', '#2d5749', '#141a20', '#c6a36b', '#98473b', '#6987a5']
export const fonts = ['Arial', 'Georgia', 'Courier New', 'Verdana'] as const
export type PanelId = typeof sections[number]['id']
export type VariantId = typeof variants[number]['id']
export type Frame = typeof frames[number]['id']
export type Walls = typeof walls[number]['id']
export type Print = typeof prints[number]['id']
export type HalfWalls = typeof halfWalls[number]['id']
export type Section = typeof sections[number]

export type Placement = { id: string; x: number; y: number; width: number; angle: number }
export type TextLayer = Placement & {
  type: 'text'; text: string; color: string; font: typeof fonts[number]; bold: boolean
}
export type ImageLayer = Placement & { type: 'image'; assetId: string; name: string; ratio: number }
export type Layer = TextLayer | ImageLayer
export type Panel = { color: string; layers: Layer[] }
export type Configuration = {
  version: 2
  productId: 'canopy'
  variantId: VariantId
  frame: Frame
  walls: Walls
  wallPrint: Print
  halfWalls: HalfWalls
  quantity: number
  panels: Record<PanelId, Panel>
}

export const product = { id: 'canopy', name: 'Canopy tent', sections, variants, frames, walls, prints, halfWalls } as const
export const catalog = { canopy: product }
export const variantFor = (id: VariantId) => variants.find(item => item.id === id)!
export const sectionFor = (id: PanelId) => sections.find(item => item.id === id)!
type WallOptions = Pick<Configuration, 'walls' | 'wallPrint' | 'halfWalls'>
/** Half walls are sold as a side pair and cannot be combined with three full walls. */
export const halfWallsAllowed = (config: Pick<Configuration, 'walls'>) => config.walls !== 'three'
export const isHalfWall = (config: WallOptions, id: PanelId) =>
  id !== 'back-wall' && halfWallsAllowed(config) && config.halfWalls !== 'none'
export const isDoubleSided = (config: WallOptions, id: PanelId) =>
  isHalfWall(config, id) ? config.halfWalls === 'double' : config.wallPrint === 'double'
export const visibleSections = (config: WallOptions) => sections.filter(section => {
  if (section.kind !== 'wall') return true
  if (section.id === 'back-wall') return config.walls !== 'none'
  return config.walls === 'three' || isHalfWall(config, section.id)
})
/** Human-readable option summary shared by the UI, the PDF and Shopify line properties. */
export function optionSummary(config: Configuration): Record<string, string> {
  const print = (id: Print) => prints.find(item => item.id === id)!.label.toLowerCase()
  return {
    Size: variantFor(config.variantId).label,
    Frame: frames.find(item => item.id === config.frame)!.label,
    'Side walls': config.walls === 'none' ? 'None'
      : walls.find(item => item.id === config.walls)!.label + ', ' + print(config.wallPrint),
    'Half walls': isHalfWall(config, 'left-wall') ? 'Set of 2, ' + print(config.halfWalls as Print) : 'None',
  }
}
export const clamp = (number: number, min: number, max: number) => Math.max(min, Math.min(max, number))

export function newConfiguration(): Configuration {
  const panels = Object.fromEntries<Panel>(sections.map(section => [
    section.id, { color: section.kind === 'roof' ? '#ed663f' : '#d95031', layers: [] },
  ])) as Configuration['panels']
  return {
    version: 2, productId: 'canopy', variantId: '8x8', frame: 'standard', walls: 'none',
    wallPrint: 'single', halfWalls: 'none', quantity: 1, panels,
  }
}
