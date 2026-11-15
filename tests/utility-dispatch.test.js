import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/utility-dispatch.js'

test('unknown utility routes fail closed', async () => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  handler({ method: 'POST', query: { handler: 'not-a-route' } }, res)
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.code, 'UNKNOWN_UTILITY_ENDPOINT')
})

test('health route keeps its GET-only contract', async () => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  await handler({ method: 'POST', query: { handler: 'health' } }, res)
  assert.equal(res.statusCode, 405)
})

test('contact and support reply preserve POST-only contracts', async () => {
  for (const route of ['contact', 'support-reply']) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
    await handler({ method: 'GET', query: { handler: route } }, res)
    assert.equal(res.statusCode, 405)
  }
})
