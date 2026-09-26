# gpt-6-astra, round 2

Screenshots sent: after1-home-1440.png, after1-home-390.png, after1-issue-1440.png, after1-issue-390.png, after1-ladder-1440.png, after1-ladder-390.png, after1-launch-graduated-1440.png, after1-launch-graduated-390.png, after1-launch-live-1440.png, after1-launch-live-390.png, after1-manual-1440.png, after1-manual-390.png, b-mechanism.png, d-graduation.png

## Round 2 verdict

**The visual system has landed; the operational story is still inconsistent.** This now reads as CorePad rather than a generic launchpad. Keep the index rail, full-width field, vertical stations and order-book rows. No structural redesign is needed.

I would approve the direction, but **not yet approve public release**. The remaining blockers are contradictory environment instructions, incorrect settlement sequencing and the creator-buy explanation—not a lack of visual polish.

### What landed

- **Provenance is substantially better.** The rehearsal banner is explicit; Manual separates the target network from the local data source and distinguishes local contract addresses.
- **Coral discipline is restored.** The transactional screens are mint-only; the field carries one isolated dot.
- **The campaign line and overall hierarchy work.** Desktop home has presence without introducing a conventional two-column hero.
- **The mobile trade ticket moved into the correct sequence.** It now precedes stats and pipeline rather than following them.
- **Curve progress and ladder distance are visibly different metrics.** Thin bars, scientific notation and integrated stats are significant improvements.
- **Issue’s review order is better.** Fields → preview → immutable-metadata warning → action is clear.
- **Manual is much more usable.** Stacked mobile parameters, readable address rows and the HTML lifecycle are all improvements.
- **The tape now has desktop audit context.** Blocks, traders and transaction references make it useful rather than decorative.

### What did not land

- The rehearsal banner still conflicts with **“Issue on Elysium,” wallet-switch instructions and bridge funding links**.
- The tracker is vertical, but **still the same incomplete four-stage model**. Mirror readiness and withdrawal claims remain missing.
- **Creator-buy copy still contradicts the stated cumulative guard.**
- Mobile ladder rows retain values but lose their **units and metric labels**.
- The mobile field is safely separated from copy, but still resembles a **narrow spike**, and its Graduation caption disappears.
- Home remains too close to a second Manual. The graduated desktop page also retains a large, effectively empty trade-ticket column.

Below is the second ranked pass.

---

## 01 — Finish environment separation at the action level

**The banner is correct; the transaction language underneath it is not.**

On Issue, the preview says `LAUNCH() · ELYSIUM`, the action says “Issue on Elysium,” and the footer instruction proposes switching to public Elysium testnet. These are incompatible with the displayed local rehearsal.

**Implement:**

- Drive banners, wallet instructions, preview labels, actions and external links from the **same deployment manifest**.
- In local mode:
  - Preview: **`launch() · LOCAL REHEARSAL`**
  - Action: **“Issue locally”**, if local signing is intentionally supported.
  - Wallet help: identify the actual rehearsal RPC/network, not the configured public target.
  - Remove public bridge-funding guidance from the transaction flow.
- If the page displays a recorded rehearsal rather than a connected local node, make it explicitly read-only.
- On home, change the eyebrow to **“TARGET ROUTE · ELYSIUM → HYPERCORE”**. The current unqualified network label competes with the provenance strip.
- Label global public-network links **“Target explorer”** and **“Target bridge”** when shown in rehearsal mode.
- The public undeployed build must show **“No CorePad testnet deployment”**, without importing rehearsal launches as available markets.

**Acceptance:** no local-mode action instructs a user to fund or sign on public testnet. These screenshots do not establish that the undeployed public state is implemented; capture that state before sign-off.

## 02 — Replace the incomplete tracker with the actual settlement sequence

**This is the largest unresolved issue from round 1.**

Home and Manual still place mirror registration after dispatch. The launch tracker goes directly from Graduation to Dispatch, then hides everything else beneath Confirmation. The graduated screen ends with a generic reverted-call message rather than an intelligible next dependency.

**Use this sequence everywhere:**

1. Graduated — ticket opened.
2. Mirror registered; route readiness verified.
3. Dispatched.
4. Withdrawals claimed after the challenge period.
5. HIP-1 listing, deposit and ladder execution.
6. Confirmed.

Keep Absorption above this sequence as launch history, not as a settlement prerequisite still in progress.

**Implement:**

- Mark Graduation **complete** once its event exists; make the next unresolved step current.
- Give the current step a short, mint operational message, executor and evidence reference.
- Decode a known `RouteNotReady` failure where available. If the revert cannot be decoded, say **“Dispatch simulation failed · reason unavailable”**—do not invent mirror readiness as its cause.
- Put raw RPC error text in an expandable technical detail, not the primary status.
- Add a separate **testnet readiness** note for the unpublished deposit factory and ticker-budget constraint. Do not present these as locally observed ticket failures without evidence.
- Quote the auction range only as the **dated observation in SPEC**, never as a current price.
- Replace “the keeper step goes away” with:
  > The future CoreWriter adapter is unused in v0. Its eventual scope depends on the published interface.

CoreWriter should not be presented as automatically eliminating the L1-signed HIP-1 ceremony.

## 03 — Resolve the creator-buy/guard contradiction before changing more copy

The Issue screen still says approximately **0.0655 HYPE buys the 2% cap**, followed by an explanation suggesting further purchases simply wait for the 1% guard to lift. Under the supplied SPEC, the creator buy itself counts toward that guard and can revert.

The graduated tape also contains a **20 M-token creator purchase**. That warrants reconciliation with the contract revision and configuration used for the rehearsal—not hiding or editing the real event.

**Implement:**

- Display two separate facts:
  - **Creator-buy contract cap: 2% of supply**
  - **Current guard allowance: [verified amount]**
- Derive the executable maximum from the applicable limits and current contract behavior.
- Remove the unconditional 2%-purchase estimate.
- State explicitly:
  > Exceeding the cumulative launch guard reverts. Graduation-crossing refunds are a separate mechanism.
- Record the contract commit and rehearsal configuration alongside the data provenance so the discrepancy can be investigated.
- Make bridge registration conditional in the introduction: **“Registers a bridge wallet when configured.”**

**Acceptance:** the suggested maximum succeeds in simulation against the exact contracts supplying the page.

## 04 — Make the trade ticket communicate whether it is executable

The desktop shell says **“No wallet detected”**, while the ticket presents a strong filled **Buy** button with an empty amount and no quote. Whatever the actual click behavior, the screenshot communicates readiness to trade.

**Implement an explicit action hierarchy:**

- No provider → **“Wallet required”**, with connection/help action as appropriate.
- Wrong environment → verified network-switch action.
- Empty amount → **“Enter an amount”**.
- Quote unavailable → **“Quote unavailable”** with the reason.
- Valid quote and successful simulation → **“Buy [ticker]”** or **“Sell [ticker]”**.

For unavailable transaction actions, use an opaque background, solid mint outline and explicit wording—not Issue’s current faint dashed button.

Also:

- Increase slippage and deadline hit areas to **44px minimum**, keeping their visible styling compact.
- Label the form **“TRADE · CURVE”** rather than “TICKET · CURVE”; reserve **Settlement ticket** for the protocol object.
- Keep the improved mobile placement. Do not push the form down again to accommodate additional explanations.

## 05 — Remove the graduated page’s empty trade column

On desktop LATZ, a 360px right column is reserved for three sentences while the tracker and stats remain constrained on the left. This is unused form space, not useful negative space.

**Implement a closed-launch layout modifier:**

- Remove the trade-column allocation once curve trading is unavailable.
- Put a compact status block directly below the curve summary:
  **“Curve closed · Settlement ticket #1 open”**, followed by the next verified dependency.
- Let the tracker and existing stat strip use the full workspace width.
- Remove the separate **“TICKET · CURVE”** section on mobile.
- Do not claim current HyperCore trading availability from graduation alone. Show a venue link only when the relevant listing evidence is available.

This preserves the launch-page structure while making its closed state intentional.

## 06 — Restore mobile ladder semantics without making the rows tall

The mobile ladder now retains price and raised amounts, but **`1.573e−8`, `4.18 / 10` and `26.18%` are effectively unlabeled**. The home preview has the same issue.

**Implement:**

- Price line: **`1.573e−8 HYPE/token`**
- Funding line: **`RAISED 4.18 / 10 HYPE`**
- Rail label: **`26.18% remaining`**
- Closed row: **`0% remaining · CURVE CLOSED`**, with **Final curve price** distinguished from an active curve quote.

Use a compact two-column metadata layout with **11px labels / 12–13px values**. Allow roughly **120–132px per mobile row** if needed; do not preserve density by deleting meaning.

In the All filter, group active and closed launches with a plain section separator. LATZ should not lead what otherwise reads as a proximity ranking.

## 07 — Refine the mobile field rather than shrinking the desktop terrain

The field now has its own zone and the dot has breathing room. Those changes worked. The mobile central peak, however, is still tall and narrow relative to its horizontal run.

**Implement:**

- Generate a mobile-specific relief envelope.
- As a starting adjustment, reduce peak displacement by **20–25%** and widen the main ridge by **30–40%**.
- Preserve the flat entry and a clearly settled final quarter.
- Keep hidden-line masking; inspect the ridge shoulder for bright, bunched segments at native pixel size.
- Retain all three captions on mobile:
  **01 Absorb / 02 Graduate / 03 Settle**.
  Use short labels in three columns; move explanatory text below or omit it at this breakpoint.
- Keep the single dot static and isolated.

The current two-line mobile campaign headline is acceptable. I would **not** force three lines now—the more important repair is restoring the three-stage visual narrative.

## 08 — Shorten home, and make the capacity comparison genuinely legible

Home remains a long technical document on mobile. The Settle station is particularly dense, and rescue/CoreWriter notes repeat Manual.

**Implement:**

- Absorb and Graduate: **45–60 words each**.
- Settle: a short paragraph plus a compact ordered sequence:
  **Mirror → Dispatch → Challenge/claim → HIP-1/deposit/ladder → Confirm**.
- Keep detailed executor/API explanations in Manual.
- Reduce rescue and future CoreWriter to two short linked notes.
- Preserve the current section order; bring the ladder closer by editing content, not replacing stations with cards.

The capacity graphic also needs a small correction: both rows have a full-length visual footprint because the HyperEVM track is outlined.

- Use two directly comparable **solid mint segments** on the same scale, without a full-width mint box around the smaller one.
- Keep the **published estimates / not telemetry** attribution immediately beside the values.
- Replace “so it never desynchronises HyperCore” with restrained capacity language. It is an architectural explanation, not an absolute performance guarantee.

## 09 — Finish the typography and line-style audit

The hierarchy is markedly better, but several numeric samples still appear slanted—particularly zeros, amounts and input placeholders. Confirm whether this is font selection, an inherited style or simply the supplied font’s glyph design.

**Implement and verify:**

```css
.numeric,
input,
code,
pre {
  font-style: normal;
  font-synthesis: none;
}

.numeric {
  font-family: "Geist Mono", monospace;
  font-variant-numeric: tabular-nums;
}
```

- Inspect the loaded font face rather than compensating with a different typeface.
- Preserve exact identifier case: the Issue preview currently turns `launch()` into `LAUNCH()`.
- Use mint, not secondary tint, for actionable blockers and essential transaction instructions.
- Replace dim/dashed structural borders with solid mint.
- Check section boundaries for doubled borders; assign each shared boundary to one component.

Do not make everything brighter or heavier. The remaining work is consistency, not another type-scale overhaul.

## 10 — Restore transaction evidence on the mobile tape

Desktop gained a TX column, but mobile drops it. The remaining address reads as the trader, so a phone user cannot readily identify the underlying transaction.

**Implement:**

- First line: **side · HYPE amount · token amount**.
- Second line: **block · trader · TX detail/copy control**.
- Replace the shorthand **`H`** with **`HYPE`**.
- Identify the token quantity with its ticker, either in the row or a persistent mobile label.
- In rehearsal mode, open local event details or offer copying—not a public explorer link.
- Put fee, transaction hash and log index in row details.
- Keep the existing buy/sell accounting explanation, but shorten its visible heading and expose the full wording through an accessible disclosure.

The tape should remain compact; auditability must survive the breakpoint.

## 11 — Give Manual clearer evidence boundaries and code affordances

Manual’s responsive layout is largely repaired. The remaining issue is distinguishing **protocol invariants, rehearsal configuration and external network facts**.

**Implement:**

- Label the parameter section:
  **“Protocol constants and current rehearsal configuration.”**
- Distinguish the local **10 HYPE graduation target / 1 HYPE reserve** from intended testnet or mainnet settings.
- Split contract addresses into:
  - **Connected rehearsal contracts**
  - **Target-network infrastructure references**
- Add the settlement readiness note from item 02 near the mechanism, not only deep in documentation.
- Put **“Scroll horizontally”** at the top of each overflowing code block, with a Copy control and keyboard-focusable scroll region. The current single hint after all event blocks arrives too late.
- Add `scroll-margin-top` to section anchors for the mobile header.
- Correct the claim that the tracker reads “events only” if route readiness, simulations or keeper evidence also contribute to it.

---

### Release order

**Blockers:** 01–03, plus truthful transaction availability in 04.  
**Largest visual payoff:** 05–08.  
**Final consistency pass:** 09–11.

Before sign-off, capture the **public undeployed state**, mobile Index open, unavailable quote, RPC failure/stale data and decoded settlement blocker. Screenshots establish the visual improvements; they do not establish wallet safety, error behavior or evidence handling.

**The direction is right. The next pass should make every label as precise as the rails.**
