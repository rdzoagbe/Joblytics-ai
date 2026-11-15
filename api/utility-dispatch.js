// Three public, low-traffic utility routes share one Vercel Function.
// Keep original external URLs through rewrites in vercel.json.
// This preserves the 12-function Hobby limit without removing any endpoint.
import health from '../server/handlers/health.js'
import contact from '../server/handlers/contact.js'
import supportReply from '../server/handlers/support-reply.js'

const HANDLERS = Object.freeze({
  'health': health,
  'contact': contact,
  'support-reply': supportReply
})

export default function handler(req, res) {
  const queryRoute = req.query?.handler
  const route = typeof queryRoute === 'string' ? queryRoute : ''
  const selected = HANDLERS[route]
  if (!selected) return res.status(404).json({ error: 'Unknown utility endpoint', code: 'UNKNOWN_UTILITY_ENDPOINT' })
  return selected(req, res)
}
