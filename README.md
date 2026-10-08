<p align="center">
  <img src=".github/assets/header-app.png" alt="CorePad" width="100%">
</p>

<p align="center">
  <a href="https://corepad.app"><img src="https://img.shields.io/badge/live-corepad.app-B4E6D2?style=flat-square&labelColor=141B14" alt="corepad.app"></a>
  <img src="https://img.shields.io/badge/network-Elysium%20testnet%2099801-B4E6D2?style=flat-square&labelColor=141B14" alt="Elysium testnet">
  <img src="https://img.shields.io/badge/stack-Vite%20%2B%20TypeScript%20%2B%20viem-B4E6D2?style=flat-square&labelColor=141B14" alt="Vite + TypeScript + viem">
  <a href="https://github.com/CorePad-team/corepad-contracts"><img src="https://img.shields.io/badge/contracts-corepad--contracts-B4E6D2?style=flat-square&labelColor=141B14" alt="contracts"></a>
  <a href="https://x.com/CorePad_hl"><img src="https://img.shields.io/badge/X-@CorePad__hl-B4E6D2?style=flat-square&labelColor=141B14" alt="X"></a>
</p>

# CorePad app

> CorePad leverages Elysium to execute high-density launches, settling seamlessly into Hyperliquid Core.

The front end of CorePad, live at **[corepad.app](https://corepad.app)**. Every number on screen is read from
the chain: launches from `LaunchCreated`, prices and reserves from each `LaunchPool`, and the settlement
pipeline from `Settlement` tickets and the bridge route. No indexer, no backend database.

<p align="center">
  <img src=".github/assets/app-field.png" alt="Field: Absorb. Graduate. Settle." width="100%">
</p>

## Ladder

Every launch, ordered by tokens left to sell. At 800 M sold the pool freezes and anyone can call `graduate()`.

<p align="center">
  <img src=".github/assets/app-ladder.png" alt="Ladder of launches" width="100%">
</p>

## Launch page

Curve progress, price, FDV, virtual reserves, the launch guard, and a buy/sell panel with slippage and deadline.

<p align="center">
  <img src=".github/assets/app-launch.png" alt="Launch page with the trade panel" width="100%">
</p>

## Settlement pipeline

Each step from graduation to the HyperCore book, with the transaction that completed it. Launch #2 (CPTWO)
went through graduation, mirror registration and dispatch on testnet.

<p align="center">
  <img src=".github/assets/app-pipeline.png" alt="Settlement pipeline of launch #2" width="100%">
</p>

## Issue and manual

<table>
  <tr>
    <td width="50%"><img src=".github/assets/app-issue.png" alt="Issue a launch"></td>
    <td width="50%"><img src=".github/assets/app-manual.png" alt="Manual: every protocol contract with its role"></td>
  </tr>
  <tr>
    <td align="center"><sub>Issue a launch: name, symbol (unique, reserved tickers refused), optional creator buy</sub></td>
    <td align="center"><sub>Manual: mechanism, parameters, trust model, events, every contract address</sub></td>
  </tr>
</table>

## Mobile

<p align="center">
  <img src=".github/assets/mobile-ladder.png" alt="Ladder on mobile" width="32%">
  &nbsp;
  <img src=".github/assets/mobile-launch.png" alt="Launch page on mobile" width="32%">
</p>

## Run it

```bash
npm install
npm run dev        # local dev server
npm run build      # brand check + production build to dist/
npm run typecheck
```

The deployment manifest is `src/deployments/99801.json` (copied from `corepad-contracts/deployments/`). A dry-run
manifest is never treated as a deployment: the app then shows a pre-deployment state. `api/rpc.js` is a small
RPC proxy used by the deployed site, with the public Elysium RPC as fallback.

## Layout

```
src/views/   home (Field), ladder, launch, issue, manual
src/abi/     contract ABIs exported from corepad-contracts
src/chain.ts reads: launches, pools, tickets, route readiness
src/config.ts network, deployment manifest, bridge contract references
api/rpc.js   RPC proxy
```
