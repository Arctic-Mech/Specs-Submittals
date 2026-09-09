# Estimator (vendored)

`index.html` here is the **Arctic Bid Tool**, copied verbatim from
[`arctic-mech/bids`](https://github.com/Arctic-Mech/bids) (its generated single-file build),
with one addition: a **Dingus host bridge** `<script>` appended at the end of the file
(clearly commented). Everything above that block is upstream and should not be hand-edited —
to update the estimator, re-copy `bids/index.html` over this file and re-append the bridge.

## What the bridge does

When the page is opened normally it is exactly the standard Bid Tool.

When The Dingus embeds it as a page (an **iframe**, `?dingus=1`), the bridge talks to the
Dingus parent window over **`postMessage`** (same origin, so ArrayBuffers transfer directly —
no size limit, no new browser tab):

1. announces `dingus-ready` (and whether the company file is already in this browser),
2. receives `dingus-open` with the estimate spreadsheet (and, the first time on a browser,
   the company file) as transferable ArrayBuffers, installs the company file if given, and
   loads the spreadsheet as the active bid,
3. posts `dingus-saved` with the edited spreadsheet back to The Dingus on every autosave,
   when the tab is hidden, and when The Dingus asks (`dingus-request-save`, the "Done" button).

The Dingus files that spreadsheet into ShareFile as the estimate's mirror. **Nothing is written
to Firebase, and nothing opens in a new tab.**

## The company file

The Bid Tool needs the private **Arctic Company File** (`.arctic` = `company_data.json` +
`workbook.xlsm`) to price a bid. It holds wage/fringe tables, tax and comp factors, permit and
bond rates, and the workbook — so it is deliberately **not** in this (public) repo.

The Dingus keeps it in the job's ShareFile folder (`Dingus Documents/Arctic Company File.arctic`)
and hands its bytes to the estimator over `postMessage` the first time a browser needs it; the
estimator then remembers it in IndexedDB. Load or replace it any time from The Dingus
(**Estimates → Company file…**, or the **Company file…** button on the estimator's top bar).

## Requirements

- Chrome or Edge on desktop (same as The Dingus).
- The Arctic Company File loaded once (via The Dingus, or the estimator's own one-time setup).
