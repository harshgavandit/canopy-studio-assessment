import { artwork, loadImage } from './art.ts'
import { newConfiguration, type Configuration } from './catalog.ts'
import { parseConfiguration, type CartItem } from './contract.ts'
const draftKey = 'canopy-studio-draft-v1'
const cartKey = 'canopy-studio-cart-v1'

export function initialDraft(): Configuration {
  try {
    const saved = localStorage.getItem(draftKey)
    if (saved) return parseConfiguration(JSON.parse(saved))
  } catch { /* Storage is optional in a restricted iframe. */ }
  const configuration = newConfiguration()
  configuration.panels['front-roof'].layers.push({
    type: 'text', id: 'starter-roof', text: 'FIELDWORK', x: 0.5, y: 0.72, width: 0.42,
    angle: 0, color: '#fff6e8', font: 'Arial', bold: true,
  })
  configuration.panels['front-valance'].layers.push({
    type: 'text', id: 'starter-valance', text: 'OUTDOOR SUPPLY CO.', x: 0.5, y: 0.49, width: 0.31,
    angle: 0, color: '#fff6e8', font: 'Arial', bold: true,
  })
  return configuration
}

export function saveDraft(config: Configuration) {
  try { localStorage.setItem(draftKey, JSON.stringify(config)); return true } catch { return false }
}
export function loadCart(): CartItem[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(cartKey) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch { return [] }
}
export function saveCart(cart: CartItem[]) {
  try { localStorage.setItem(cartKey, JSON.stringify(cart)) } catch { /* In-memory cart still works. */ }
}

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('canopy-studio-assets', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('images')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Image storage is unavailable.'))
  })
}

export async function storeImage(id: string, data: string) {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('images', 'readwrite')
      tx.objectStore('images').put(data, id)
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
      tx.onerror = () => reject(tx.error)
    })
  } finally { db.close() }
}

export async function getStoredImage(id: string): Promise<string | undefined> {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('images', 'readonly').objectStore('images').get(id)
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : undefined)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

export async function restoreImages(config: Configuration) {
  const ids = [...new Set(Object.values(config.panels).flatMap(panel =>
    panel.layers.flatMap(layer => layer.type === 'image' && !artwork.has(layer.assetId) ? [layer.assetId] : []),
  ))]
  if (!ids.length) return
  const db = await database()
  try {
    const store = db.transaction('images', 'readonly').objectStore('images')
    await Promise.all(ids.map(id => new Promise<void>((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => {
        const data: unknown = request.result
        if (typeof data !== 'string') return resolve()
        loadImage(data).then(image => { artwork.set(id, image); resolve() }, reject)
      }
      request.onerror = () => reject(request.error)
    })))
  } finally { db.close() }
}
