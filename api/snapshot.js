// Market snapshot for the first paint. One server-side read of the chain, cached at the edge for
// 15 s (and served stale for a minute while it refreshes), so a visitor sees numbers at once and the
// public Elysium node answers once per cache period instead of once per visitor. The browser keeps
// reading the chain live after this paint; the snapshot is never the only source.
import { createPublicClient, http, parseAbiItem, formatEther } from 'viem'
import deployment from '../src/deployments/99801.json' with { type: 'json' }

const RPC = 'https://testnet-rpc.elysium.kinetiq.xyz'
const chain = {
  id: 99801, name: 'Elysium Testnet', nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
}
const client = createPublicClient({ chain, transport: http(RPC, { retryCount: 3 }), batch: { multicall: { batchSize: 65536 } } })
const launchEv = parseAbiItem('event LaunchCreated(uint256 indexed id, address indexed token, address indexed pool, address creator, string name, string symbol)')
const tradeEv = parseAbiItem('event Trade(address indexed pool, address indexed trader, bool isBuy, uint256 hypeAmount, uint256 tokenAmount, uint256 fee, uint256 virtualHype, uint256 virtualToken)')
const poolAbi = ['virtualHype', 'virtualToken', 'tokensSold', 'realHype', 'graduationHype', 'graduated', 'frozen'].map((n) =>
  ({ type: 'function', name: n, stateMutability: 'view', inputs: [], outputs: [{ type: n === 'graduated' || n === 'frozen' ? 'bool' : 'uint256' }] }))

const S = (v) => (typeof v === 'bigint' ? v.toString() : v)

export default async function handler(req, res) {
  try {
    const head = await client.getBlockNumber()
    const factory = deployment.CorePadFactory
    const from = BigInt(deployment.deployedAtBlock ?? 0)
    const logs = await client.getLogs({ address: factory, event: launchEv, fromBlock: from, toBlock: head })
    const launches = logs.map((l) => ({ id: l.args.id, token: l.args.token, pool: l.args.pool, creator: l.args.creator, name: l.args.name, symbol: l.args.symbol, block: l.blockNumber }))
    const pools = launches.map((l) => l.pool)
    const [reads, trades] = await Promise.all([
      client.multicall({ allowFailure: true, contracts: pools.flatMap((p) => poolAbi.map((f) => ({ address: p, abi: poolAbi, functionName: f.name }))) }),
      pools.length ? client.getLogs({ address: pools, event: tradeEv, fromBlock: launches[0].block, toBlock: head }) : [],
    ])
    const act = new Map(pools.map((p) => [p.toLowerCase(), { trades: 0, volume: 0n, traders: new Set() }]))
    const all = new Set()
    for (const t of trades) {
      const a = act.get(t.address.toLowerCase()); if (!a) continue
      a.trades++; a.volume += t.args.hypeAmount; a.traders.add(t.args.trader); all.add(t.args.trader)
    }
    const bySym = new Map(launches.map((l) => [l.pool.toLowerCase(), l]))
    const recent = trades.slice(-8).reverse().map((t) => {
      const l = bySym.get(t.address.toLowerCase())
      return { pool: t.address, symbol: l?.symbol ?? '', id: S(l?.id ?? 0n), isBuy: t.args.isBuy, hype: S(t.args.hypeAmount), trader: t.args.trader, block: S(t.blockNumber), tx: t.transactionHash, logIndex: t.logIndex }
    })
    const rows = launches.map((l, i) => {
      const r = reads.slice(i * poolAbi.length, (i + 1) * poolAbi.length).map((x) => (x.status === 'success' ? x.result : null))
      const [vH, vT, sold, raised, target, graduated, frozen] = r
      const a = act.get(l.pool.toLowerCase())
      const ok = vH !== null && vT !== null && sold !== null
      return {
        launch: { ...l, id: S(l.id), block: S(l.block) },
        state: ok ? {
          virtualHype: S(vH), virtualToken: S(vT), sold: S(sold), raised: S(raised), target: S(target), graduated: Boolean(graduated),
          frozen: Boolean(graduated || (frozen ?? sold >= 800_000_000n * 10n ** 18n)),
          price: vT > 0n ? Number(formatEther(vH)) / Number(formatEther(vT)) : 0,
          progress: Math.min(1, Number((sold * 1_000_000n) / (800_000_000n * 10n ** 18n)) / 1_000_000),
        } : null,
        act: { trades: a.trades, volume: S(a.volume), traders: a.traders.size },
      }
    })
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'public, s-maxage=15, stale-while-revalidate=60')
    res.status(200).send(JSON.stringify({ head: S(head), at: Math.floor(Date.now() / 1000), traders: all.size, rows, recent }))
  } catch (e) {
    res.setHeader('cache-control', 'no-store')
    res.status(503).json({ error: String(e?.shortMessage ?? e?.message ?? e).slice(0, 200) })
  }
}
