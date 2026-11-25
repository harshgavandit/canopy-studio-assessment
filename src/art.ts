import { clamp, isHalfWall, type Configuration, type Layer, type Panel, type Section } from './catalog.ts'

export const artwork = new Map<string, HTMLImageElement>()

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('This image could not be opened.'))
    image.src = url
  })
}

export function pathFor(ctx: CanvasRenderingContext2D, kind: Section['kind'], w: number, h: number) {
  ctx.beginPath()
  if (kind === 'roof') {
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
  } else ctx.rect(0, 0, w, h)
}

export function layerBounds(ctx: CanvasRenderingContext2D, layer: Layer, w: number, h: number) {
  const width = w * layer.width
  if (layer.type === 'image') return { width, height: width / layer.ratio, font: '' }
  const style = (layer.bold ? '700 ' : '400 ') + '100px "' + layer.font + '"'
  ctx.font = style
  const measured = Math.max(45, ctx.measureText(layer.text || ' ').width)
  const size = Math.min(width / measured * 100, h * 0.7)
  const font = (layer.bold ? '700 ' : '400 ') + size + 'px "' + layer.font + '"'
  ctx.font = font
  return { width: ctx.measureText(layer.text || ' ').width, height: size * 1.12, font }
}

export function paintPanel(
  ctx: CanvasRenderingContext2D, panel: Panel, section: Section, w: number, h: number,
  options: { selected?: string; guides?: boolean } = {},
) {
  ctx.save()
  pathFor(ctx, section.kind, w, h)
  ctx.clip()
  ctx.fillStyle = panel.color
  ctx.fillRect(0, 0, w, h)
  for (const layer of panel.layers) {
    const { width, height, font } = layerBounds(ctx, layer, w, h)
    ctx.save()
    ctx.translate(layer.x * w, layer.y * h)
    ctx.rotate(layer.angle * Math.PI / 180)
    if (layer.type === 'image') {
      const image = artwork.get(layer.assetId)
      if (image) ctx.drawImage(image, -width / 2, -height / 2, width, height)
    } else {
      ctx.fillStyle = layer.color
      ctx.font = font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(layer.text, 0, 0)
    }
    ctx.restore()
  }
  ctx.restore()

  if (!options.guides) return
  ctx.save()
  pathFor(ctx, section.kind, w, h)
  ctx.clip()
  ctx.strokeStyle = 'rgba(255,255,255,.62)'
  ctx.lineWidth = 2
  ctx.setLineDash([7, 7])
  ctx.translate(w * 0.052, h * 0.085)
  pathFor(ctx, section.kind, w * 0.896, h * 0.83)
  ctx.stroke()
  ctx.restore()
  const layer = panel.layers.find(item => item.id === options.selected)
  if (!layer) return
  const { width, height } = layerBounds(ctx, layer, w, h)
  ctx.save()
  ctx.translate(layer.x * w, layer.y * h)
  ctx.rotate(layer.angle * Math.PI / 180)
  ctx.strokeStyle = '#fff'
  ctx.shadowColor = '#152021'
  ctx.shadowBlur = 2
  ctx.lineWidth = 2
  ctx.strokeRect(-width / 2 - 6, -height / 2 - 4, width + 12, height + 8)
  ctx.fillStyle = '#fff'
  for (const x of [-width / 2 - 6, width / 2 + 6]) {
    for (const y of [-height / 2 - 4, height / 2 + 4]) ctx.fillRect(x - 3, y - 3, 6, 6)
  }
  ctx.restore()
}

/** Height / width of a panel's printable area. Half walls are shorter than full walls. */
export function panelRatio(section: Section, config: Pick<Configuration, 'walls' | 'wallPrint' | 'halfWalls'>) {
  if (section.kind === 'roof') return 0.49
  if (section.kind === 'valance') return 0.135
  return isHalfWall(config, section.id) ? 0.31 : 0.58
}

export function hitLayer(ctx: CanvasRenderingContext2D, panel: Panel, px: number, py: number, w: number, h: number) {
  return [...panel.layers].reverse().find(layer => {
    const theta = -layer.angle * Math.PI / 180
    const dx = px - layer.x * w
    const dy = py - layer.y * h
    const x = dx * Math.cos(theta) - dy * Math.sin(theta)
    const y = dx * Math.sin(theta) + dy * Math.cos(theta)
    const { width, height } = layerBounds(ctx, layer, w, h)
    return Math.abs(x) < width / 2 + 10 && Math.abs(y) < height / 2 + 10
  })
}

export async function importArtwork(file: File) {
  if (!/\.(png|jpe?g|webp|svg)$/i.test(file.name) || file.size > 10 * 1024 * 1024 || file.size === 0) {
    throw new Error('Choose a PNG, JPG, WebP or SVG image up to 10 MB.')
  }
  const url = URL.createObjectURL(file)
  try {
    const source = await loadImage(url)
    const scale = Math.min(1, 1600 / Math.max(source.naturalWidth, source.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(source.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(source.naturalHeight * scale))
    canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/png')
    const id = crypto.randomUUID()
    const ratio = clamp(source.naturalWidth / source.naturalHeight, 0.05, 20)
    const image = await loadImage(data)
    return { id, data, image, ratio }
  } finally {
    URL.revokeObjectURL(url)
  }
}
