import { useEffect, useRef, type PointerEvent } from 'react'
import { hitLayer, layerBounds, paintPanel, panelRatio, pathFor } from './art.ts'
import { clamp, type Configuration, type Layer, type Panel, type Section } from './catalog.ts'

export default function Editor({ panel, section, config, selected, revision, onSelect, onMove, onDrag, onEnd, onNudge, onRemove }: {
  panel: Panel; section: Section; config: Configuration; selected?: string; revision: number
  onSelect: (id?: string) => void; onMove: (id: string, data: Partial<Layer>) => void
  onDrag: () => void; onEnd: () => void
  onNudge: (id: string, data: Partial<Layer>) => void; onRemove: (id: string) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{
    id: string; dx: number; dy: number; pointer: number; moved: boolean
    resize?: { angle: number; startWidth: number; startX: number }
  } | null>(null)
  const width = 960
  const height = Math.round(width * panelRatio(section, config))
  const pad = 22

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(pad, pad)
    ctx.save()
    pathFor(ctx, section.kind, width, height)
    ctx.fillStyle = panel.color
    ctx.shadowColor = 'rgba(24,35,35,.23)'
    ctx.shadowBlur = 15
    ctx.shadowOffsetY = 7
    ctx.fill()
    ctx.restore()
    paintPanel(ctx, panel, section, width, height, { guides: true, selected })
    ctx.restore()
  }, [panel, section, height, selected, revision])

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    return [
      (event.clientX - box.left) / box.width * (width + pad * 2) - pad,
      (event.clientY - box.top) / box.height * (height + pad * 2) - pad,
    ]
  }

  return (
    <div className="editor-wrap">
      <div className="editor-title"><strong>{section.label}</strong><span>{section.kind === 'roof' ? 'Roof panel' : section.kind === 'valance' ? 'Canopy skirt' : 'Wall panel'}</span></div>
      <canvas ref={ref} width={width + pad * 2} height={height + pad * 2}
        className="editor-canvas" tabIndex={0}
        aria-label={'2D artwork for ' + section.label + '. Click a layer to select it, drag to move, drag a corner to resize. Arrow keys nudge the selected layer; Delete removes it.'}
        onKeyDown={event => {
          const active = panel.layers.find(item => item.id === selected)
          if (!active) return
          const step = event.shiftKey ? .05 : .01
          const moves: Record<string, Partial<Layer>> = {
            ArrowLeft: { x: clamp(active.x - step, 0, 1) }, ArrowRight: { x: clamp(active.x + step, 0, 1) },
            ArrowUp: { y: clamp(active.y - step, 0, 1) }, ArrowDown: { y: clamp(active.y + step, 0, 1) },
          }
          if (moves[event.key]) onNudge(active.id, moves[event.key])
          else if (event.key === 'Delete' || event.key === 'Backspace') onRemove(active.id)
          else if (event.key === 'Escape') onSelect(undefined)
          else return
          event.preventDefault()
        }}
        onPointerDown={event => {
          const [x, y] = point(event)
          const context = event.currentTarget.getContext('2d')!
          const active = panel.layers.find(item => item.id === selected)
          if (active) {
            const angle = -active.angle * Math.PI / 180
            const dx = x - active.x * width
            const dy = y - active.y * height
            const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
            const localY = dx * Math.sin(angle) + dy * Math.cos(angle)
            const bounds = layerBounds(context, active, width, height)
            if (Math.abs(Math.abs(localX) - bounds.width / 2 - 6) < 12 &&
                Math.abs(Math.abs(localY) - bounds.height / 2 - 4) < 12) {
              drag.current = { id: active.id, dx: active.x, dy: active.y, pointer: event.pointerId, moved: false,
                resize: { angle, startWidth: active.width, startX: Math.max(5, Math.abs(localX)) } }
              event.currentTarget.setPointerCapture(event.pointerId)
              return
            }
          }
          const hit = hitLayer(context, panel, x, y, width, height)
          onSelect(hit?.id)
          if (!hit) return
          drag.current = { id: hit.id, dx: x / width - hit.x, dy: y / height - hit.y, pointer: event.pointerId, moved: false }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const current = drag.current
          if (!current || current.pointer !== event.pointerId) return
          if (!current.moved) { current.moved = true; onDrag() }
          const [x, y] = point(event)
          if (current.resize) {
            const { angle, startWidth, startX } = current.resize
            const dx = x - current.dx * width
            const dy = y - current.dy * height
            const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
            onMove(current.id, { width: clamp(startWidth * Math.abs(localX) / startX, .04, 1.3) })
            return
          }
          onMove(current.id, { x: clamp(x / width - current.dx, 0, 1), y: clamp(y / height - current.dy, 0, 1) })
        }}
        onLostPointerCapture={() => { if (drag.current?.moved) onEnd(); drag.current = null }}
      />
      <div className="safe-guide"><span /> Dashed line shows the artwork safe area</div>
    </div>
  )
}
