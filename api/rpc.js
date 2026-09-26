// Same-origin JSON-RPC relay for Elysium testnet. Retries the upstream server-side so a flaky
// public endpoint does not look like a broken front. Read-only methods only.
const UPSTREAMS = ['https://testnet-rpc.elysium.kinetiq.xyz']
const ALLOWED = new Set([
  'eth_chainId', 'eth_blockNumber', 'eth_call', 'eth_getLogs', 'eth_getBalance', 'eth_getCode',
  'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_estimateGas',
  'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_getTransactionCount', 'net_version',
])

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body
  const calls = Array.isArray(body) ? body : [body]
  if (!calls.length || calls.length > 50 || calls.some((c) => !c || !ALLOWED.has(c.method))) {
    res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32601, message: 'method not allowed' } })
    return
  }
  let last = null
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of UPSTREAMS) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        if (r.status >= 500 || r.status === 429) { last = r.status; continue }
        const text = await r.text()
        res.setHeader('content-type', 'application/json')
        res.setHeader('cache-control', 'no-store')
        res.status(200).send(text)
        return
      } catch (e) { last = String(e) }
    }
  }
  res.status(502).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'upstream unavailable: ' + last } })
}
