import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleApi } from '../server/http.ts'
export default (req: IncomingMessage, res: ServerResponse) => handleApi('cart', req, res)
