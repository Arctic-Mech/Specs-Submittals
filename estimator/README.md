# Estimator (vendored)

`index.html` here is the **Arctic Bid Tool**, copied verbatim from
[`arctic-mech/bids`](https://github.com/Arctic-Mech/bids) (its generated single-file build),
with one addition: a **Dingus host bridge** `<script>` appended at the end of the file
(clearly commented). Everything above that block is upstream and should not be hand-edited —
to update the estimator, re-copy `bids/index.html` over this file and re-append the bridge.

## What the bridge does

When the page is opened normally it is exactly the standard Bid Tool.

When The Dingus opens it with `?dingus=<token>`, the bridge:

1. reads a handoff the Dingus wrote to `localStorage['dingus.est.handoff']`
   (`{ token, jobId, estId, name, xlsmB64, returnUrl }`),
2. loads that estimate's spreadsheet as the active bid (no diff prompt),
3. shows a green "Editing … from The Dingus" bar with a **Done — back to The Dingus** button,
4. writes the edited spreadsheet back to `localStorage['dingus.est.result.<estId>']` on every
   autosave / when the tab is hidden / on Done, and posts a `BroadcastChannel('dingus-estimator')`
   message so The Dingus can file it.

The Dingus and this page are the **same origin** (both under `arctic-mech.github.io`), so the
company file, saved bids, and these handoff keys are shared with the live Bid Tool automatically.

## Requirements

- Chrome or Edge on desktop (same as The Dingus).
- The **Arctic Company File** loaded once in this browser (Company Settings → Company file).
  If you already use the live Bid Tool in this browser, it is already loaded.
- Pop-ups allowed for the site (The Dingus opens the estimator in a tab).
