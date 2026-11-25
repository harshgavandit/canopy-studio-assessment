import { frames, sectionFor, variantFor, visibleSections, walls, type Configuration, type Section } from './catalog.ts'
import type { Quote } from './contract.ts'
import { paintPanel, panelRatio } from './art.ts'

export const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100)
export const sectionLabel = (id: Section['id']) => sectionFor(id).label

export async function downloadProof(config: Configuration, quote: Quote, id: string, preview?: string) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const proofId = id || ('draft-' + quote.id)
  const size = variantFor(config.variantId).label
  const frame = frames.find(item => item.id === config.frame)!.label
  const wall = walls.find(item => item.id === config.walls)!.label
  const title = (label: string) => {
    doc.setFillColor('#263634')
    doc.rect(0, 0, 210, 35, 'F')
    doc.setTextColor('#ffffff')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(23)
    doc.text(label, 16, 22)
    doc.setTextColor('#263634')
    doc.setFont('helvetica', 'normal')
  }
  const footer = () => {
    doc.setFontSize(8)
    doc.setTextColor('#55716a')
    doc.text('Canopy Studio  /  ' + proofId + '  /  ' + doc.getCurrentPageInfo().pageNumber, 16, 285)
  }
  title('Canopy production proof')
  doc.setFontSize(11)
  doc.text('Configuration  ' + proofId, 16, 47)
  doc.text('Variant  ' + size + '    |    Frame  ' + frame, 16, 55)
  doc.text('Walls  ' + wall + (config.walls !== 'none' ? ' (' + (config.doubleSided ? 'double-sided' : 'single-sided') + ')' : ''), 16, 63)
  doc.text('Quantity  ' + config.quantity + '    |    Quote  ' + quote.id, 16, 71)
  let y = 85
  for (const line of quote.lines) {
    doc.text(line.label, 16, y)
    doc.text(money(line.unitAmount) + ' / unit', 194, y, { align: 'right' })
    y += 7
  }
  doc.setFont('helvetica', 'bold')
  doc.text('Quoted total', 16, y + 5)
  doc.text(money(quote.total) + ' USD', 194, y + 5, { align: 'right' })
  if (preview) {
    const dimensions = doc.getImageProperties(preview)
    const maxHeight = 266 - (y + 20)
    const scale = Math.min(178 / dimensions.width, maxHeight / dimensions.height)
    doc.addImage(preview, 'JPEG', 16, y + 20, dimensions.width * scale, dimensions.height * scale)
  }
  footer()
  for (const section of visibleSections(config)) {
    doc.addPage()
    title(section.label)
    const panel = config.panels[section.id]
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = Math.round(canvas.width * panelRatio(section, config.walls))
    const drawing = canvas.getContext('2d')!
    drawing.fillStyle = '#ffffff'
    drawing.fillRect(0, 0, canvas.width, canvas.height)
    paintPanel(drawing, panel, section, canvas.width, canvas.height)
    const imageHeight = 175 * canvas.height / canvas.width
    doc.addImage(canvas.toDataURL('image/jpeg', .94), 'JPEG', 16, 47, 175, imageHeight)
    let position = 47 + imageHeight + 13
    doc.setFontSize(10)
    doc.text('Background  ' + panel.color.toUpperCase(), 16, position)
    position += 9
    for (const [index, layer] of panel.layers.entries()) {
      if (position > 258) {
        footer()
        doc.addPage()
        title(section.label + ' / artwork')
        position = 49
      }
      const label = layer.type === 'text'
        ? 'Text: ' + layer.text + '  [' + layer.font + (layer.bold ? ' Bold' : '') + ', ' + layer.color + ']'
        : 'Image: ' + layer.name + '  [' + layer.assetId + ']'
      const lines: string[] = doc.splitTextToSize((index + 1) + '. ' + label, 176)
      doc.text(lines, 16, position)
      position += lines.length * 5
      doc.text('X ' + Math.round(layer.x * 100) + '%   Y ' + Math.round(layer.y * 100) +
        '%   Width ' + Math.round(layer.width * 100) + '%   Rotation ' + layer.angle + ' deg', 20, position)
      position += 8
    }
    footer()
  }
  doc.save('canopy-' + proofId + '.pdf')
}
