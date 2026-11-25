import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { artwork, importArtwork } from './art.ts'
import { clamp, fonts, frames, halfWalls, halfWallsAllowed, newConfiguration, optionSummary, prints, sectionFor, swatches,
  variants, visibleSections, walls, type Configuration, type Layer, type PanelId } from './catalog.ts'
import { parseConfiguration, type CartItem, type Quote } from './contract.ts'
import Editor from './Editor.tsx'
import Icon from './Icon.tsx'
import type { PreviewApi } from './Preview.tsx'
import { downloadProof, money } from './proof.ts'
import { getStoredImage, initialDraft, loadCart, restoreImages, saveCart, saveDraft, storeImage } from './storage.ts'

const Preview = lazy(() => import('./Preview.tsx'))
const embed = new URLSearchParams(location.search).get('embed') === '1'
type Tool = 'background' | 'text' | 'uploads'
const tools: { id: Tool; label: string; icon: 'palette' | 'type' | 'image' }[] = [
  { id: 'background', label: 'Color', icon: 'palette' },
  { id: 'text', label: 'Text', icon: 'type' },
  { id: 'uploads', label: 'Artwork', icon: 'image' },
]

function quoteKey(config: Configuration) {
  const decorated = visibleSections(config).map(({ id }) =>
    config.panels[id].layers.some(layer => layer.type === 'image' || layer.text.trim()) ? id : '',
  ).join(',')
  return [config.variantId, config.frame, config.walls, config.wallPrint, config.halfWalls, config.quantity, decorated].join('|')
}

async function request<T>(route: string, data: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/' + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal,
  })
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The configuration service is unavailable. Please try again.')
  }
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'The request failed.')
  return payload as T
}

/** Number input that keeps a local draft, so an empty or partial entry doesn't snap the value. */
function NumberField({ label, value, min, max, onValue }: {
  label: string; value: number; min: number; max: number; onValue: (value: number) => void
}) {
  const [draft, setDraft] = useState<string>()
  return <label className="field">{label}<input type="number" min={min} max={max} value={draft ?? String(value)}
    onChange={event => {
      const text = event.target.value
      setDraft(text)
      if (text.trim() !== '' && Number.isFinite(Number(text))) onValue(Number(text))
    }}
    onBlur={() => setDraft(undefined)} /></label>
}

function notifyHost(type: 'ready' | 'resize' | 'saved' | 'cart' | 'cart-open', payload: object) {
  if (!embed || window.parent === window) return
  const raw = new URLSearchParams(location.search).get('parent_origin')
  if (!raw) return
  try {
    const address = new URL(raw)
    if (address.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(address.hostname)) {
      window.parent.postMessage({ source: 'canopy-studio', type, ...payload }, address.origin)
    }
  } catch { /* Invalid parent origin is ignored. */ }
}

export default function App() {
  const [config, setConfig] = useState(initialDraft)
  const current = useRef(config)
  const past = useRef<Configuration[]>([])
  const lastEdit = useRef({ tag: '', at: 0 })
  const future = useRef<Configuration[]>([])
  const [historyRevision, syncHistory] = useState(0)
  const [assetRevision, setAssetRevision] = useState(0)
  const [panel, setPanel] = useState<PanelId>('front-roof')
  const [selectId, setSelectId] = useState<string>()
  const [mode, setMode] = useState<'3d' | '2d'>('3d')
  const [tool, setTool] = useState<Tool>('background')
  const [tab, setTab] = useState<'design' | 'product'>('design')
  const [preview, setPreview] = useState<{ kind: 'loading' | 'ready' | 'error'; message?: string }>({ kind: 'loading' })
  const [quote, setQuote] = useState<{ key: string; value: Quote }>()
  const [quoteError, setQuoteError] = useState('')
  const [tryQuote, setTryQuote] = useState(0)
  const [cart, setCart] = useState(loadCart)
  const [cartOpen, setCartOpen] = useState(false)
  const [busy, setBusy] = useState<'cart' | 'pdf' | 'upload'>()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [hex, setHex] = useState('')
  const [colorTarget, setColorTarget] = useState('panel')
  const visual = useRef<PreviewApi | null>(null)
  const savedPreviews = useRef(new Map<string, string>())
  const fileInput = useRef<HTMLInputElement>(null)
  const cartDialog = useRef<HTMLDialogElement>(null)
  const uploadTarget = useRef<PanelId>('front-roof')
  const bindVisual = useCallback((api: PreviewApi | null) => { visual.current = api }, [])
  const allowedSections = visibleSections(config)
  const selectedPanel = config.panels[panel]
  const section = sectionFor(panel)
  const selected = selectedPanel.layers.find(item => item.id === selectId)
  const key = quoteKey(config)
  const activeQuote = quote?.key === key ? quote.value : undefined

  const imageIds = allowedSections.flatMap(({ id }) => config.panels[id].layers.flatMap(layer =>
    layer.type === 'image' ? [layer.assetId] : [])).join(',')
  useEffect(() => {
    let active = true
    void restoreImages(current.current).then(() => {
      if (active) setAssetRevision(n => n + 1)
    }).catch(err => {
      if (active) { setAssetRevision(n => n + 1); setError(err.message) }
    })
    return () => { active = false }
  }, [imageIds])

  useEffect(() => {
    if (embed) {
      notifyHost('ready', {})
      const root = document.getElementById('root')!
      const observed = new ResizeObserver(() => notifyHost('resize', { height: root.scrollHeight }))
      observed.observe(root)
      return () => observed.disconnect()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setQuoteError('')
    const timer = setTimeout(() => {
      void request<Quote>('quote', current.current, controller.signal)
        .then(value => setQuote({ key, value }))
        .catch(err => { if (!controller.signal.aborted) setQuoteError(err.message) })
    }, 120)
    return () => { clearTimeout(timer); controller.abort() }
  }, [key, tryQuote])

  useEffect(() => {
    const flush = () => saveDraft(current.current)
    const timer = setTimeout(flush, 125)
    window.addEventListener('pagehide', flush)
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', flush) }
  }, [config])

  useEffect(() => {
    setHex(config.panels[panel].color)
    if (!visibleSections(config).some(item => item.id === panel)) { setPanel('front-roof'); setSelectId(undefined) }
  }, [config, panel])

  useEffect(() => {
    if (cartOpen) {
      cartDialog.current?.showModal()
      notifyHost('cart-open', {})
    }
    else cartDialog.current?.close()
  }, [cartOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return
      const key = event.key.toLowerCase()
      if (key === 'z' || key === 'y') {
        event.preventDefault()
        moveHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!notice) return
    const timeout = setTimeout(() => setNotice(''), 3600)
    return () => clearTimeout(timeout)
  }, [notice])

  function mark() {
    lastEdit.current = { tag: '', at: 0 }
    past.current = [...past.current.slice(-49), current.current]
    future.current = []
    syncHistory(n => n + 1)
  }

  /**
   * `remember` adds an undo step. A string tag groups rapid repeats of the same edit (typing,
   * dragging a color picker, nudging) into one step.
   */
  function apply(next: Configuration, remember: boolean | string = true) {
    if (typeof remember === 'string') {
      const now = Date.now()
      const repeat = lastEdit.current.tag === remember && now - lastEdit.current.at < 1200
      if (!repeat) mark()
      lastEdit.current = { tag: remember, at: now }
    } else if (remember) mark()
    current.current = next
    setConfig(next)
  }

  function patch(data: Partial<Configuration>, remember: boolean | string = true) { apply({ ...current.current, ...data }, remember) }

  function replacePanel(id: PanelId, data: Partial<Configuration['panels'][PanelId]>, remember: boolean | string = true) {
    const prev = current.current
    apply({ ...prev, panels: { ...prev.panels, [id]: { ...prev.panels[id], ...data } } }, remember)
  }

  function setLayer(id: string, data: Partial<Layer>, remember: boolean | string = 'layer:' + id + ':' + Object.keys(data).join()) {
    replacePanel(panel, { layers: current.current.panels[panel].layers.map(item =>
      item.id === id ? { ...item, ...data } as Layer : item) }, remember)
  }

  function moveHistory(direction: 'undo' | 'redo') {
    const from = direction === 'undo' ? past.current : future.current
    const to = direction === 'undo' ? future.current : past.current
    const previous = from.pop()
    if (!previous) return
    to.push(current.current)
    apply(previous, false)
    syncHistory(n => n + 1)
    setSelectId(undefined)
  }

  function choosePanel(id: PanelId, focus = false) {
    setPanel(id)
    setSelectId(undefined)
    if (focus) visual.current?.focus(id)
  }

  function applyColor(value: string) {
    if (!/^#[\da-f]{6}$/i.test(value)) return
    const previous = current.current
    const panels = { ...previous.panels }
    const ids = colorTarget === 'canopy'
      ? allowedSections.filter(item => item.kind !== 'wall').map(item => item.id)
      : colorTarget === 'valances' ? allowedSections.filter(item => item.kind === 'valance').map(item => item.id) : [panel]
    if (ids.every(id => panels[id].color === value)) return
    for (const id of ids) panels[id] = { ...panels[id], color: value }
    apply({ ...previous, panels }, 'color:' + ids.join())
  }

  function append(id: PanelId, layer: Layer) {
    const layers = current.current.panels[id].layers
    if (layers.length >= 12) { setError('This panel can contain up to 12 layers.'); return }
    replacePanel(id, { layers: [...layers, layer] })
    choosePanel(id)
    setSelectId(layer.id)
    setMode('2d')
  }

  function addText() {
    setError('')
    const id = crypto.randomUUID()
    append(panel, {
      id, type: 'text', text: 'Your text', color: '#ffffff', font: 'Arial', bold: true,
      x: .5, y: section.kind === 'roof' ? .71 : .5, width: section.kind === 'roof' ? .43 : .38, angle: 0,
    })
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setBusy('upload')
    try {
      const target = uploadTarget.current
      const targetSection = sectionFor(target)
      const { id, image, ratio, data } = await importArtwork(file)
      artwork.set(id, image)
      try { await storeImage(id, data) } catch { setNotice('Artwork is available in this session.') }
      append(target, {
        id, type: 'image', assetId: id, name: file.name.slice(0, 160), ratio, x: .5,
        y: targetSection.kind === 'roof' ? .72 : .5,
        width: targetSection.kind === 'valance' ? clamp(ratio * .09, .04, .35) : clamp(ratio * .17, .075, .38), angle: 0,
      })
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(undefined) }
  }

  function removeLayer(id: string) {
    replacePanel(panel, { layers: current.current.panels[panel].layers.filter(item => item.id !== id) })
    setSelectId(undefined)
  }

  function orderLayer(id: string, change: number) {
    const layers = [...selectedPanel.layers]
    const index = layers.findIndex(item => item.id === id)
    const next = index + change
    if (next < 0 || next >= layers.length) return
    ;[layers[index], layers[next]] = [layers[next], layers[index]]
    replacePanel(panel, { layers })
  }

  async function addToCart() {
    if (!activeQuote || busy) return
    const snapshot = current.current
    const previewImage = visual.current?.capture()
    setBusy('cart')
    setError('')
    try {
      await restoreImages(snapshot)
      const item = await request<CartItem>('cart', { configuration: snapshot, quoteId: activeQuote.id })
      if (previewImage) {
        savedPreviews.current.set(item.id, previewImage)
        void storeImage('proof-' + item.id, previewImage).catch(() => {})
      }
      const updated = [...cart, item]
      setCart(updated)
      saveCart(updated)
      setCartOpen(true)
      notifyHost('cart', {
        id: item.id, total: item.quote.total, currency: item.quote.currency, proofFile: item.proofFile, lines: item.shopify,
      })
    } catch (err) {
      setError((err as Error).message)
      setTryQuote(n => n + 1)
    } finally { setBusy(undefined) }
  }

  async function exportProof(item?: CartItem) {
    const details = item?.quote ?? activeQuote
    if (!details || busy) return
    const configToExport = item?.configuration ?? current.current
    const canonical = JSON.stringify(parseConfiguration(configToExport))
    const saved = item ?? [...cart].reverse().find(entry =>
      entry.quote.id === details.id && JSON.stringify(entry.configuration) === canonical)
    setBusy('pdf')
    setError('')
    try {
      await restoreImages(configToExport)
      const capture = saved
        ? savedPreviews.current.get(saved.id) ?? await getStoredImage('proof-' + saved.id).catch(() => undefined)
        : visual.current?.capture()
      await downloadProof(configToExport, details, saved?.id ?? '', capture)
      setNotice('Production proof downloaded.')
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(undefined) }
  }

  function save() {
    const stored = saveDraft(current.current)
    notifyHost('saved', { configuration: current.current })
    setNotice(stored ? 'Design saved on this device.' : 'Design sent to the host, when embedded.')
  }

  function removeCart(id: string) {
    const next = cart.filter(item => item.id !== id)
    setCart(next)
    saveCart(next)
    savedPreviews.current.delete(id)
  }

  return (
    <div className={'app-shell' + (embed ? ' embedded' : '')} data-history={historyRevision}>
      <header className="topbar">
        <div className="container topline">
          <a className="brand" href={embed ? location.pathname + location.search : "/"} aria-label="Canopy Studio home"><span className="brand-mark"><Icon name="logo" size={25} /></span><span>CANOPY<span className="brand-light">STUDIO</span></span></a>
          <div className="top-actions">
            <button className="text-button" onClick={save}><Icon name="check" size={16} />{embed ? 'Save & exit' : 'Save design'}</button>
            <button className="cart-button" aria-label={'Open cart, ' + cart.length + ' designs'} onClick={() => setCartOpen(true)}><Icon name="cart" size={19} /><span>Cart</span><b>{cart.length}</b></button>
          </div>
        </div>
      </header>

      <main className="container">
        {!embed && <div className="intro">
          <div><p className="eyebrow"><span /> PRODUCT CONFIGURATOR</p><h1>Custom Canopy<span>.</span></h1></div>
          <p>Make the tent yours. Design each panel,<br className="wide-only" /> then see it come together in 3D.</p>
        </div>}
        <div className="workbench">
          <section className="visual-card" aria-label="Canopy workspace">
            <div className="visual-toolbar">
              <div className="segmented" aria-label="Preview mode">
                <button aria-pressed={mode === '3d'} onClick={() => setMode('3d')}><Icon name="cube" size={17} /> 3D preview</button>
                <button aria-pressed={mode === '2d'} onClick={() => setMode('2d')}><Icon name="layers" size={17} /> 2D editor</button>
              </div>
              <div className="toolbar-buttons">
                <button className="icon-button" aria-label="Undo" title="Undo" disabled={!past.current.length} onClick={() => moveHistory('undo')}><Icon name="undo" /></button>
                <button className="icon-button" aria-label="Redo" title="Redo" disabled={!future.current.length} onClick={() => moveHistory('redo')}><Icon name="redo" /></button>
                <span className="toolbar-rule" />
                <button className="icon-button" aria-label="Reset camera" title="Reset camera" disabled={mode !== '3d' || preview.kind !== 'ready'} onClick={() => visual.current?.reset()}><Icon name="reset" size={18} /></button>
              </div>
            </div>
            <div className={'stage ' + (mode === '2d' ? 'stage-editor' : 'stage-viewer')}>
              <div className={'stage-layer' + (mode === '2d' ? ' visually-inactive' : '')} aria-hidden={mode === '2d'} inert={mode === '2d'}>
                <Suspense fallback={null}><Preview config={config} revision={assetRevision} onApi={bindVisual} onSelect={id => { choosePanel(id); setTab('design') }} onStatus={setPreview} /></Suspense>
              </div>
              {mode === '3d' && <>
                <div className="stage-caption"><span /> LIVE 3D PREVIEW</div>
                {preview.kind === 'loading' && <div className="loading-stage"><div className="spinner" /> Loading the canopy…</div>}
                {preview.kind === 'ready' && <div className="stage-hint">Drag to orbit <span>·</span> Scroll to zoom</div>}
              </>}
              {mode === '2d' && <Editor config={config} panel={selectedPanel} section={section} selected={selectId} revision={assetRevision}
                onSelect={setSelectId} onMove={(id, data) => setLayer(id, data, false)} onDrag={mark} onEnd={() => saveDraft(current.current)}
                onNudge={(id, data) => setLayer(id, data, 'nudge:' + id)} onRemove={removeLayer} />}
            </div>
            <div className="panel-bar">
              <div className="panel-bar-heading"><strong>Canopy panels</strong><span>{allowedSections.length} editable sections</span></div>
              <div className="panel-row" aria-label="Canopy sections">
                {allowedSections.map(item => <button key={item.id} aria-label={item.label} title={item.label} aria-pressed={item.id === panel}
                  onClick={() => { choosePanel(item.id, true); setTab('design') }}>
                  <span className={'panel-shape ' + item.kind} style={{ background: config.panels[item.id].color }} />
                  <span>{item.label}</span>
                </button>)}
              </div>
            </div>
          </section>

          <aside className="controls-card" aria-label="Configuration controls">
            <div className="controls-tabs">
              <button aria-pressed={tab === 'design'} onClick={() => setTab('design')}>Design</button>
              <button aria-pressed={tab === 'product'} onClick={() => setTab('product')}>Product options</button>
            </div>
            <div className="controls-body">
              {tab === 'design' ? <>
                <div className="controls-title"><div><p className="eyebrow">EDITING PANEL</p><h2>{section.label}</h2></div><button className="edit-link" onClick={() => setMode('2d')}>Edit in 2D</button></div>
                <div className="tool-tabs" aria-label="Design tools">
                  {tools.map(item => <button key={item.id} aria-pressed={tool === item.id} onClick={() => setTool(item.id)}><Icon name={item.icon} size={17} />{item.label}</button>)}
                </div>
                {tool === 'background' && <div className="tool-body">
                  <label className="field">Apply color to<select value={colorTarget} onChange={event => setColorTarget(event.target.value)}>
                    <option value="panel">This panel</option><option value="valances">All valances</option><option value="canopy">Entire canopy</option>
                  </select></label>
                  <div className="field"><span>Fabric color</span><div className="swatches">{swatches.map(color => <button
                    key={color} title={color} aria-label={'Set color ' + color} aria-pressed={selectedPanel.color.toLowerCase() === color}
                    style={{ '--swatch': color } as React.CSSProperties} onClick={() => applyColor(color)} />)}</div></div>
                  <div className="hex-field">
                    <label className="color-box" title="Custom fabric color"><input aria-label="Custom fabric color" type="color" value={selectedPanel.color}
                      onChange={event => applyColor(event.target.value)} /></label>
                    <input aria-label="Fabric hex code" maxLength={7} value={hex} onChange={event => setHex(event.target.value)}
                      onBlur={() => { if (/^#[\da-f]{6}$/i.test(hex)) applyColor(hex.toLowerCase()); else setHex(selectedPanel.color) }}
                      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
                  </div>
                </div>}
                {tool === 'text' && <div className="tool-body"><button className="outline-button full" onClick={addText}><Icon name="plus" size={17} /> Add text</button></div>}
                {tool === 'uploads' && <div className="tool-body">
                  <button className="upload-button" disabled={busy === 'upload'} onClick={() => { uploadTarget.current = panel; fileInput.current?.click() }}>
                    <Icon name="image" size={25} /><strong>{busy === 'upload' ? 'Opening artwork…' : 'Upload artwork'}</strong><span>PNG, JPG, WebP or SVG · up to 10 MB</span>
                  </button>
                  <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.webp,.svg" onChange={upload} hidden />
                </div>}
                <div className="layer-block">
                  <h3>Layers <span>{selectedPanel.layers.length}</span></h3>
                  {!selectedPanel.layers.length && <p className="muted small">Add text or artwork to this panel.</p>}
                  {selectedPanel.layers.map(item => <button className="layer-button" key={item.id} aria-pressed={item.id === selectId}
                    onClick={() => { setSelectId(item.id); setTool(item.type === 'text' ? 'text' : 'uploads'); setMode('2d') }}>
                    <Icon name={item.type === 'text' ? 'type' : 'image'} size={16} /><span>{item.type === 'text' ? item.text || 'Untitled text' : item.name}</span>
                  </button>)}
                </div>
                {selected && <div className="layer-settings">
                  {selected.type === 'text' && <>
                    <label className="field">Text<input value={selected.text} maxLength={100} onChange={event => setLayer(selected.id, { text: event.target.value })} /></label>
                    <div className="form-pair">
                      <label className="field">Font<select value={selected.font} onChange={event => setLayer(selected.id, { font: event.target.value as typeof fonts[number] })}>{fonts.map(item => <option key={item}>{item}</option>)}</select></label>
                      <label className="field">Text color<input type="color" value={selected.color} onChange={event => setLayer(selected.id, { color: event.target.value })} /></label>
                    </div>
                    <label className="check-field"><input type="checkbox" checked={selected.bold} onChange={event => setLayer(selected.id, { bold: event.target.checked })} />Bold text</label>
                  </>}
                  <div className="form-pair">
                    <NumberField label="Position X (%)" min={0} max={100} value={Math.round(selected.x * 100)} onValue={n => setLayer(selected.id, { x: clamp(n / 100, 0, 1) })} />
                    <NumberField label="Position Y (%)" min={0} max={100} value={Math.round(selected.y * 100)} onValue={n => setLayer(selected.id, { y: clamp(n / 100, 0, 1) })} />
                    <NumberField label="Width (%)" min={4} max={130} value={Math.round(selected.width * 100)} onValue={n => setLayer(selected.id, { width: clamp(n / 100, .04, 1.3) })} />
                    <NumberField label="Rotation (°)" min={-180} max={180} value={selected.angle} onValue={n => setLayer(selected.id, { angle: clamp(Math.round(n), -180, 180) })} />
                  </div>
                  <div className="layer-actions">
                    <button className="icon-button" disabled={selected === selectedPanel.layers.at(-1)} aria-label="Bring layer forward" title="Bring layer forward" onClick={() => orderLayer(selected.id, 1)}><Icon name="up" /></button>
                    <button className="icon-button" disabled={selected === selectedPanel.layers[0]} aria-label="Send layer backward" title="Send layer backward" onClick={() => orderLayer(selected.id, -1)}><Icon name="down" /></button>
                    <button className="text-button danger" onClick={() => removeLayer(selected.id)}><Icon name="trash" size={16} /> Remove layer</button>
                  </div>
                </div>}
              </> : <>
                <div className="controls-title"><div><p className="eyebrow">YOUR SETUP</p><h2>Tent options</h2></div></div>
                <div className="options-fields">
                  <label className="field">Tent size<select value={config.variantId} onChange={event => patch({ variantId: event.target.value as Configuration['variantId'] })}>{variants.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
                  <label className="field">Frame<select value={config.frame} onChange={event => patch({ frame: event.target.value as Configuration['frame'] })}>{frames.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
                  <label className="field">Side walls<select value={config.walls} onChange={event => {
                    const next = event.target.value as Configuration['walls']
                    patch({ walls: next, halfWalls: halfWallsAllowed({ walls: next }) ? config.halfWalls : 'none' })
                  }}>{walls.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
                  {config.walls !== 'none' && <label className="field">Side wall print<select value={config.wallPrint} onChange={event => patch({ wallPrint: event.target.value as Configuration['wallPrint'] })}>{prints.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>}
                  <label className="field">Half walls<select value={config.halfWalls} disabled={!halfWallsAllowed(config)} onChange={event => patch({ halfWalls: event.target.value as Configuration['halfWalls'] })}>{halfWalls.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
                  {!halfWallsAllowed(config) && <p className="field-note">Half walls are not available with 3 full side walls.</p>}
                  <NumberField label="Quantity" min={1} max={100} value={config.quantity} onValue={n => patch({ quantity: clamp(Math.round(n), 1, 100) }, 'quantity')} />
                  <button className="outline-button" onClick={() => { apply(newConfiguration()); choosePanel('front-roof'); setNotice('Blank design started.') }}>Start a blank design</button>
                </div>
              </>}
            </div>
            <div className="summary">
              <div className="quote-total"><div><strong>Estimated total</strong><span>USD · before tax and shipping</span></div><b aria-live="polite">{activeQuote ? money(activeQuote.total) : '—'}</b></div>
              {activeQuote && <details className="quote-details"><summary>Price breakdown</summary>{activeQuote.lines.map(item => <div key={item.id}><span>{item.label}</span><span>{money(item.unitAmount)} / unit</span></div>)}</details>}
              {quoteError && <div className="request-error">{quoteError} <button onClick={() => setTryQuote(n => n + 1)}>Retry</button></div>}
              <button className="primary-button" onClick={addToCart} disabled={!activeQuote || !!busy}><Icon name="cart" />{busy === 'cart' ? 'Adding design…' : 'Add design to cart'}</button>
              <button className="proof-button" onClick={() => exportProof()} disabled={!activeQuote || !!busy}><Icon name="download" size={17} />{busy === 'pdf' ? 'Building proof…' : 'Download production proof'}</button>
            </div>
          </aside>
        </div>
        {!embed && <footer className="site-footer"><span>Canopy Studio</span><a href="/embed-demo.html">Open embed demo</a></footer>}
      </main>

      {notice && <div className="toast" role="status"><Icon name="check" size={17} />{notice}</div>}
      {error && !cartOpen && <div className="toast error-toast" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => setError('')}><Icon name="close" size={16} /></button></div>}
      <dialog ref={cartDialog} className="cart-dialog" onClose={() => setCartOpen(false)} onClick={event => { if (event.target === event.currentTarget) setCartOpen(false) }}>
        <div className="cart-sheet">
          {error && <p role="alert" className="request-error">{error}</p>}
          <div className="controls-title"><div><p className="eyebrow">DEMO CART</p><h2>Your designs</h2></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close cart"><Icon name="close" /></button></div>
          {!cart.length && <p className="muted">Your cart is empty.</p>}
          {cart.map(item => <article className="cart-item" key={item.id}>
            <div><strong>{optionSummary(item.configuration).Size} canopy</strong><b>{money(item.quote.total)}</b></div>
            <p>{item.configuration.quantity} × {Object.entries(optionSummary(item.configuration)).filter(([key, value]) => key !== 'Size' && value !== 'None').map(([key, value]) => key === 'Frame' ? value : key + ': ' + value).join(' · ')}</p>
            <div><button className="text-button" disabled={!!busy} onClick={() => exportProof(item)}><Icon name="download" size={16} /> Production proof</button><button className="text-button danger" onClick={() => removeCart(item.id)}>Remove</button></div>
          </article>)}
          {!!cart.length && <div className="cart-total"><strong>Cart total</strong><b>{money(cart.reduce((total, item) => total + item.quote.total, 0))}</b></div>}
        </div>
      </dialog>
    </div>
  )
}
