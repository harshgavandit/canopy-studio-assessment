import type { IncomingMessage, ServerResponse } from 'node:http'
import { createMockCartItem, quoteConfiguration } from './service.ts'

export async function handleApi(route: 'quote' | 'cart', req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.writeHead(405).end(JSON.stringify({ error: 'Use POST for this endpoint.' }))
    return
  }
  try {
    let body: unknown = (req as IncomingMessage & { body?: unknown }).body
    if (body === undefined) {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.length
        if (size > 128 * 1024) {
          res.writeHead(413).end(JSON.stringify({ error: 'Configuration is too large.' }))
          return
        }
        chunks.push(buffer)
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } else if (typeof body === 'string') body = JSON.parse(body)
    const result = route === 'quote' ? quoteConfiguration(body) : createMockCartItem(body)
    res.writeHead(route === 'cart' ? 201 : 200).end(JSON.stringify(result))
  } catch (error) {
    const message = error instanceof SyntaxError ? 'Send valid JSON.' : (error as Error).message
    res.writeHead(message.startsWith('The quote changed') ? 409 : 400).end(JSON.stringify({ error: message }))
  }
}
