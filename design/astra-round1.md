# gpt-6-astra, round 1

Screenshots sent: before-home-1440.png, before-home-390.png, before-issue-1440.png, before-issue-390.png, before-ladder-1440.png, before-ladder-390.png, before-launch-graduated-1440.png, before-launch-graduated-390.png, before-launch-live-1440.png, before-launch-live-390.png, before-manual-1440.png, before-manual-390.png, b-mechanism.png, d-graduation.png

## Overall verdict

**Keep the architecture.** The numbered index, full-width field, vertical stations and ladder rows are distinctive and appropriate. The main problems are **environment misrepresentation, coral used as a status colour, and mobile hierarchy**—not a need for a new page template.

Ranked below by launch impact. Measurements are implementation targets based on the screenshots.

### 01 — Make data provenance unmistakable
**Problem →** The screenshots say “Elysium testnet,” “protocol deployed” and “real live from Elysium,” while displaying local rehearsal contracts. The Manual even shows a localhost RPC beneath an Elysium testnet label. Real contract execution is not the same as a real testnet deployment.

**Exact change →**
- Introduce explicit configuration:
  ```ts
  type Environment = 'undeployed' | 'local-rehearsal' | 'testnet';
  ```
  Select through a deployment manifest; **do not infer environment from chain ID alone**.
- Above every page’s content, render a flat, mint-bordered provenance strip: **12px Geist Mono / 18px**, `padding: 10px 16px`.
  - Public app now: **“PRE-DEPLOYMENT · No CorePad testnet deployment.”**
  - Rehearsal: **“LOCAL REHEARSAL · Real contract execution · Not Elysium testnet.”**
  - Recorded rehearsal, if offered: include its actual capture time and block.
- Replace `#18` on mobile with the environment label. Put block information inside Index.
- Public undeployed mode: no local launch rows, balances, factory addresses or transaction buttons. Show **“No testnet deployment yet”**, not zero launches or zero volume.
- Local addresses must not link to the public testnet explorer. Separate **configured target network** from **connected data source** in Manual.

### 02 — Remove coral from all UI states
**Problem →** Coral appears in graduated badges, every ladder endpoint, curve endpoint text, tracker squares and SELL text. These directly violate BRAND.md: **never text, never a line, never a UI state**.

**Exact change →**
- Replace all those colours and borders with `#B4E6D2`.
- Encode status geometrically:
  - Completed: **8×8px filled mint square**.
  - Current: **10×10px mint outline with 4×4px mint centre**.
  - Pending: **8×8px outline square**.
  - Blocked: outlined square plus literal **BLOCKED** label.
- BUY and SELL both use mint; distinguish through words, not colour.
- Restrict `#E0574F` to one dedicated event-dot component: **6px diameter desktop, 5px mobile**, no border.
- Keep that dot in the conceptual home field only; omit it from transactional screens. **Zero coral is compliant.**
- Add a lint/check script rejecting coral literals outside the dot component and brand assets.

### 03 — Correct the lifecycle promises before polishing them
**Problem →** “Never locked” is stronger than the contract guarantee. The tracker skips mirror registration. “The book takes over” implies immediate settlement, despite bridge delays and currently unavailable infrastructure.

**Exact change →**
- Replace **“Never locked”** with **“Open-ticket rescue”**:
  > After `rescueDelay`, the immutable treasury can rescue an undispatched ticket. Dispatched assets are outside this rescue path.
- Display the actual sequence:
  **Graduated → Mirror registered / route ready → Dispatched → Withdrawals claimed → HIP-1 / deposit / ladder → Confirmed**.
- On the current public app, add **“Settlement dependencies unavailable”** with separate rows for the unpublished deposit factory and ticker-budget requirement.
- Treat the cited testnet auction cost as a **dated observation**, not a current quote or fixed minimum. Never imply a 0.5 or 1 HYPE budget guarantees listing.
- Replace “book takes over” with **“pool freezes; settlement begins after graduation.”**
- Keep `listPrice` labelled **HYPE/token**. A TOKEN/USDC ladder requires conversion and venue rounding; do not present the HYPE number as a USDC order price.
- Use **13px / 20px** mint text for these operational constraints, not faint footnotes.

### 04 — Put the trade ticket within reach on mobile
**Problem →** On the absorbing launch, the actionable ticket starts below the header, large progress section, four stats and the entire tracker—roughly 1,000px down the page.

**Exact change →**
- Mobile order: **launch identity → compact curve summary → trade ticket → stats → pipeline → tape**.
- Graduated launch order: **identity → curve summary → settlement status and tracker → stats → tape**; there is no useful trade form.
- Use one accessible DOM sequence rather than duplicating forms:
  ```css
  .launch-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    grid-template-areas:
      "summary ticket"
      "stats ticket"
      "pipeline tape";
  }
  @media (max-width: 959px) {
    .launch-layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "summary" "ticket" "stats" "pipeline" "tape";
    }
  }
  ```
- Set mobile launch-section padding to **24px 16px**, ticket fields to **48px high**, and internal vertical gaps to **16px**.

### 05 — Give the field its own bounded zone
**Problem →** On mobile, the relief rises behind the Manual button. The field becomes tall spikes rather than topographic relief, and the dot sits on a rail instead of alone in the void.

**Exact change →**
- Make hero copy, actions, field and captions separate normal-flow blocks. **No negative margin or absolutely positioned canvas beneath copy.**
- Field dimensions: **360px high desktop; 240px mobile**. Leave **32px desktop / 24px mobile** between actions and field.
- Generate geometry for the actual container width with `ResizeObserver`; do not horizontally squash desktop coordinates.
- Target **8–10px rail pitch desktop**, **9–11px mobile**; reduce rail count on mobile rather than cramming the full field into 390px.
- At roughly 1,200px rendered width, use **1.6px mint strokes**; at 390px, **1px**. Render canvas at device pixel ratio.
- Keep the first **12%** and final **25%** of width perfectly level. Use an envelope with zero value and slope at both boundaries.
- Use hidden-line masking in `#141B14`; rails must not cross or form bright merged knots.
- Reserve a blank pocket with **at least 16px clearance** around the single coral dot. Remove decorative `L02/L06/...` labels; these resemble market data without providing any.

### 06 — Restore the actual campaign line
**Problem →** “Absorb the burst. Settle the book.” omits graduation and weakens continuity with the finished brand kit.

**Exact change →**
- H1: **“Absorb. Graduate. Settle.”**
- Desktop: **72px / 74px, Geist 500, tracking −0.02em**; use a deliberate two-line composition if needed.
- At 390px: **40px / 42px**, with:
  ```
  Absorb.
  Graduate.
  Settle.
  ```
- Keep the supplied tagline verbatim below, **17px / 26px desktop; 16px / 24px mobile**, maximum **62ch**.
- Use two hero buttons only: **Open the ladder** and **Issue a launch**, **44px high**, **8px gap**. Manual remains available in the index.
- During pre-deployment, Issue can open the explanatory page, but must not suggest an available transaction.

### 07 — Establish a readable type system, not uniformly dim microtype
**Problem →** Labels, identifiers, prices and metadata are frequently too small and visually similar. Some numbers appear slanted; that is inconsistent with the surgical typographic direction.

**Exact change →**
- Load the supplied variable fonts with `font-weight: 100 900`; apply `font-synthesis: none; font-style: normal`.
- Shared scale:
  - Page H1: **48/52px desktop, 32/36px mobile**, Geist 500, `−0.02em`.
  - Section H2: **32/38px desktop, 26/32px mobile**, Geist 500.
  - Station H3: **22/28px**, Geist 500.
  - Body: **15/23px**, Geist 400.
  - Labels: **11/16px**, Geist Mono 500, uppercase, `0.10em`.
  - Transactional numbers: **13/20px**, Geist Mono 500, normal tracking.
- Use `#B4E6D2` for values, instructions and essential status. Reserve `#6F9A8A` for secondary copy and labels.
- Do not apply opacity to text. Preserve exact case for `listPrice`, `graduate()` and other identifiers.

### 08 — Remove unapproved surface colours and transparency
**Problem →** Shaded depth fills, code slabs and faint structural rules introduce a layered terminal aesthetic that is not the kit’s flat, mint-line language.

**Exact change →**
- Restrict tokens:
  ```css
  :root {
    --bg: #141B14;
    --mint: #B4E6D2;
    --secondary: #6F9A8A; /* text only */
    --coral: #E0574F;     /* event dot only */
  }
  ```
- All panel backgrounds remain `--bg`; all structural strokes use `--mint`.
- Use **1px borders**, but reduce their count: one row separator rather than boxes around every cell; remove dashed separators within short metadata lists.
- Code blocks: background unchanged, **1px mint left border**, **16px padding**, no tinted slab.
- Use solid mint for actual progress fills. No alpha fills, gradients, shadows, backdrop filters or dim-mint chart strokes.
- Differentiate disabled controls using an outline and explicit unavailable text—not coral or opacity.

### 09 — Make the ladder’s metric unambiguous
**Problem →** “Depth to graduation” currently fills as graduation approaches, so it reads as progress rather than remaining distance. Graduated launches also lead a section titled “Closest to graduation.”

**Exact change →**
- Honour the chosen distance metaphor:
  ```ts
  remainingTokens = max(0n, saleAllocation - soldTokens);
  remainingFraction = remainingTokens / saleAllocation;
  ```
  Compute the rendered percentage using fixed-point arithmetic.
- Label the column **TO GRADUATION**. At 73.8% sold, show **26.2% remaining**; at graduation, show **0% · CURVE CLOSED**.
- Render a **2px mint segment** against an outlined **8px-high track**, with the number outside the bar in a fixed **64px** column.
- Home preview includes only absorbing launches, ordered by remaining tokens ascending. Show **“Up to five active launches”**, not a promise of five rows.
- The full ladder can retain closed launches under its existing filter, clearly separated from active ranking.

### 10 — Keep launch rows dense without deleting important mobile data
**Problem →** Desktop rows work structurally, but mobile loses raised HYPE and state context while spending substantial height on each token.

**Exact change →**
- Desktop shared header/row grid:
  ```css
  grid-template-columns:
    40px minmax(140px, 1fr) 120px
    minmax(180px, 1.4fr) 140px 112px;
  gap: 16px;
  ```
- Rows: **64px minimum height**, **12px vertical padding**; numbers right-aligned.
- Mobile: **28px minmax(0, 1fr) auto**, **8px gaps**, approximately **104px per row**:
  1. ID / ticker / state.
  2. Price with `HYPE` / raised-target pair.
  3. Remaining-distance rail spanning the content columns.
- Ticker **15/20px 500**; name **12/16px secondary**; numbers **12/18px mono**.
- Keep token price, raised amount and remaining distance visible. Truncate only the descriptive name.
- Use a real link for launch identity and an obvious **2px mint focus outline**; avoid inaccessible click-only table rows.

### 11 — Replace the four-step tracker with an evidence-led vertical tracker
**Problem →** “PIPELINE · TICKET” appears before a ticket exists. The desktop horizontal tracker is sparse yet cannot accommodate the actual settlement prerequisites.

**Exact change →**
- Before graduation: title **LAUNCH PIPELINE**, with **“No settlement ticket yet.”**
- After `Graduated`: title **SETTLEMENT · TICKET #n**.
- Use vertical rows at every breakpoint:
  **24px marker column + minmax(0,1fr) description + evidence column**.
- Completed rows: **44px minimum**; current row: **72px minimum**, showing blocker, executor and next action.
- Desktop evidence column **140px**; on mobile place evidence beneath the description.
- Populate milestones only from contract state/events or explicitly identified keeper evidence. `Dispatched` alone must not imply withdrawals have been claimed.
- Do not offer `dispatch(id)` until route readiness is verified; show **“Awaiting mirror registration”** otherwise.
- Never infer elapsed progress or completion from a timer.

### 12 — Make the launch progress bar subordinate to its information
**Problem →** The 44px solid mint bar dominates the launch page. “Distance to graduation” labels a sold-progress bar, and raised HYPE is buried in a sentence.

**Exact change →**
- Rename this component **CURVE SOLD**; unlike the ladder’s distance bar, this one explicitly measures completed sale.
- Reduce bar to **16px desktop / 12px mobile**, with **1px mint boundary**.
- Above: **sold / 800 M** left; **percentage** right, **14px mono**.
- Below: two aligned metadata rows:
  - **Raised, net of fees** / target HYPE.
  - **Estimated gross buy to close** / HYPE, only when a valid quote is available.
- Endpoint and ticks are mint. On mobile use **0 / 400 M / 800 M**, not five cramped labels.
- Stats remain the existing integrated strip, not new cards. Use **20/26px numbers**, **11/16px labels**, **16px padding**.
- Split virtual reserves into two labelled lines so `482.50 M` never breaks before its unit.

### 13 — Make numeric formatting fit a trading product
**Problem →** The tiny subscript-zero price notation is difficult to scan and nearly impossible to compare on mobile. Units sometimes wrap away from their amounts.

**Exact change →**
- Use scientific notation below `0.0001`: **`1.573e−7`**, with **HYPE/token** in the column label.
- Show **4–5 significant digits** in rows; expose the exact decimal value through a focusable detail/copy control.
- Apply:
  ```css
  .numeric {
    font-family: "Geist Mono";
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  ```
- Use nonbreaking spaces for amount-unit pairs: `590.50 M`, `4.1763 HYPE`.
- Keep raw amounts as `bigint` or a decimal type through formatting and quote calculation; do not convert wei balances to JavaScript `Number`.
- Explicitly label the graduated pool value **FINAL CURVE PRICE**, not an apparent current HyperCore price.

### 14 — Fix Issue’s review order and guard explanation
**Problem →** Mobile asks users to issue before showing the preview. Placeholder names resemble populated inputs, and the “2% creator buy” explanation ignores the active cumulative guard.

**Exact change →**
- Mobile order: **fields → transaction preview → immutable-metadata warning → submit**.
- Desktop may retain the side-by-side form/preview, but the final action follows the review content in DOM order.
- Inputs **48px high**, **16px text**, **24px between field groups**. Use placeholders **“Token name”** and **“SYMBOL”**, not rehearsal launch names.
- Validate name bytes with `new TextEncoder().encode(name).length`; symbol with `/^[A-Z0-9]{1,6}$/`.
- State: **“Creator-buy cap: 2% of supply. The active per-address guard may impose a lower limit.”**
- Derive the actual allowable buy and quote from current configuration; simulate before enabling submit. Guard overflow reverts—it is not refunded like a graduation-crossing buy.
- Empty preview identity becomes **“Enter token metadata”**, **18/24px**, rather than two large em dashes and excessive blank space.

### 15 — Give the trade tape audit value
**Problem →** The tape has no time or transaction evidence, addresses wrap over two lines on mobile, and the HYPE column hides different buy/sell semantics.

**Exact change →**
- Move the tape below the main launch workspace on desktop so it can use the full content width.
- Desktop columns: **time/block | side | HYPE | token quantity | trader | transaction**. Header **11/16px**, values **12/18px**, rows **36px**.
- Mobile rows **48px minimum**:
  - First line: side, HYPE, token quantity.
  - Second line: time/block and short trader/transaction link.
- Force shortened addresses onto one line; allow copying the complete value.
- Explain HYPE semantics in the header help: **buy = gross retained after refund; sell = net received**. Expose event fee in row details.
- Sort by block, transaction index and log index; deduplicate by transaction hash plus log index.
- No invented timestamps, synthetic trades or animated market activity. Empty state: **“No Trade events in this data source.”**

### 16 — Shorten home by making its stations editorial, not duplicating Manual
**Problem →** The home pipeline repeats most of Manual and produces a roughly 4,700px mobile page before providing much actionable launch information.

**Exact change →**
- Keep vertical stations, grouped into the campaign’s three stages:
  **01 Absorb / 02 Graduate / 03 Settle**.
- Under Settle, retain mirror registration, dispatch, challenge period and keeper execution as explicit substeps.
- Each station: **one 45–65-word paragraph**, then at most **three metadata rows**. Link to Manual for the full mechanics.
- Desktop station grid: **96px minmax(0,1fr) 240px**, **32px gap**.
- Mobile: **24px number column + remaining content**, **16px gap**, **32px vertical padding**.
- Put rescue and future CoreWriter in unnumbered notes, not extra stages in the current flow.
- Keep the throughput comparison, but label it **“Published capacity estimates · project memo”**, not telemetry. Remove “a sniper wave is a queue, not an outage”—capacity does not guarantee congestion immunity.

### 17 — Repair Manual’s mobile tables and technical accuracy
**Problem →** Numbers and words split arbitrarily, addresses become dense multiline fragments, and event signatures are abbreviated or incorrect.

**Exact change →**
- Desktop Manual layout: **160px local contents rail + minmax(0,760px)**, **32px gap**.
- At less than **760px**, replace the three-column parameter table with stacked definition rows:
  **label → unbroken value → source**, **16px vertical padding**.
- Addresses: **contract name + chain** first line; **short address + Copy + Explorer** second line. Full address available through expansion; copy always uses the complete address.
- Remove global `word-break: break-all`. Use local `overflow-wrap:anywhere` only where unavoidable.
- Code blocks: `max-width:100%; overflow-x:auto`, **12/19px mono**, keyboard-focusable with a visible **“Scroll horizontally”** hint.
- Replace the ASCII lifecycle tree with an HTML ordered list that wraps naturally.
- Generate event declarations from the ABI, including `Frozen` and complete `Graduated`, `Dispatched`, `Confirmed`, `Rescued` arguments.
- Collapse mobile contents into a **44px-high “Contents · 06 sections”** disclosure.

### 18 — Preserve the index rail, tighten the shared shell
**Problem →** The rail is a strong asset, but its small status text is hard to read and mobile Index is undersized.

**Exact change →**
- Keep the desktop rail at **236px**, `position:fixed`, `height:100dvh`; content margin matches it.
- Standard desktop content gutter **40px**; mobile **16px**.
- Index rows **48px high**, with a **28px number column**, **14px label**, and optional **11px secondary descriptor**.
- Mobile header **56px high**, opaque `#141B14`; Index target **44×44px minimum**.
- Index opens a full-width, in-flow vertical navigation disclosure—not a horizontal tab bar or translucent overlay.
- Use official lockup assets. At a **26–28px mark height**, use the small optical mark where constructing the lockup from assets; preserve its spacing and clear space.
- Keep blank space on short ladder pages. Do not fill it with speculative stats or extra cards.

### 19 — Use motion only for interaction and genuine data changes
**Problem →** Screenshots cannot establish current motion behaviour. This identity would be weakened by continuously breathing terrain, pulsing dots or simulated tape activity.

**Exact change →**
- Default field: **static seeded geometry**, redrawn only on resize.
- Dot: no pulse, orbit or movement.
- Hover/focus: **120ms colour transition**, no translation or scale. Use solid mint inversion for selected controls.
- Progress changes: at most **180ms linear**, only after a real state update; snap immediately under `prefers-reduced-motion`.
- Do not auto-scroll the tape. If the user is reading older rows, show a real **“N new events”** button.
- On RPC failure, preserve the last successful values with **“STALE · last read block …”**. Never replace failed reads with plausible zeros.

**Release order:** fix **01–03** before public exposure; then **04–12** for the largest visual and usability improvement. The result should feel like the same CorePad app—more precise, more legible, and materially more trustworthy.
