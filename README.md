# Submittal Register — Divisions 22 & 23

A submittal log for mechanical spec sections. Import a project spec PDF, it is
split into its individual Division 22 and 23 sections, and each section carries
a status, searchable tags, the submittal PDFs sent out, the response PDFs that
come back, and what has been released to site.

The whole app is `index.html`. There is no build step.

## Firebase setup

The register lives in Firestore, and so do any uploaded PDFs. Cloud Storage
would be the natural home for the files, but it needs a billing account —
Firestore does not, so uploads are split across chunk documents instead. Bigger
documents are better linked from ShareFile than uploaded. Nothing here costs
anything on the free Spark plan.

1. **Firestore** — Firebase console → Build → Firestore Database → Create
   database. Any location; the rules below replace whatever mode you pick.
2. **Rules** — paste `firestore.rules` into Firestore → Rules, then Publish.
3. **Authorised domains** — Authentication → Settings → Authorised domains must
   list wherever the page is served from (for GitHub Pages that is
   `<user>.github.io`).

Or, with the Firebase CLI:

```
firebase deploy --only firestore:rules
```

There is no Cloud Storage step, and no bucket to create.

### Access

The rules as written let anyone who can reach the page read, edit and delete
everything. That is deliberate for now — no sign-in, no accounts. The Firebase
config in `index.html` is not a secret (client config never is), but with open
rules it is the only thing between the register and the public. Add Anonymous
or Google sign-in and swap `if true` for `if request.auth != null` when the URL
starts being shared.

## Tags and search

Search covers the section number, the title, tags, vendor, package, notes,
release labels and document names.

Tags are what make search useful. On import each section's text is scanned for
the terms mechanical people actually search for, with the synonyms spelled out —
searching **VFD** finds 23 09 00 Instrumentation and Control even though that
section never types "VFD", only "variable frequency" (40 times) and "VFC" (21).
Terms are ranked so what a section is *named* after beats what it merely
mentions, and each section keeps the strongest 14.

Anything the scan missed can be typed in by hand in the section panel, and any
tag can be removed. Re-importing a spec adds newly detected tags but never
brings back one that was deleted. When a search matches on a tag, the row shows
which tag it was.

## Status, lead time and release

The submittal status runs Not Started → Waiting on Vendor → Submitted to GC →
Partial Approval → Approved, with Revise & Resubmit and Not Required alongside.

Release is tracked separately, because a section can be approved and only part
of it released. Approving a section moves it to **Ready to Release**. Recording
a release asks whether it finishes the section or is only part of it — "Phase 1
— TU boxes" — and works out the expected delivery from the section's lead time
in weeks. That date can be overridden when the vendor says otherwise. A section
can hold as many releases as it takes; the table shows the earliest delivery
still outstanding.

## Documents: upload or link

A submittal or a response can be either an uploaded PDF or a link to where the
file already lives — ShareFile, or anything else with a URL. A link can point at
one file or at a whole folder.

Uploads view inline and are good for the small things: a stamped response, a
two-page letter. Links are for the big vendor packages, and they use none of the
storage allowance. Each section's panel offers both, and a job can carry a link
to its ShareFile folder, shown as a button beside the spec files.

ShareFile's own API is not used and cannot be: its OAuth needs a server-side
client secret and its endpoints send no CORS headers, so a static page is
blocked. A link needs none of that.

## Data

```
jobs/{jobId}                        name, number, ShareFile folder, spec files, roll-up
jobs/{jobId}/sections/{sectionKey}  the log: status, tags, lead time, releases, documents
jobs/{jobId}/specdata/{sectionKey}  the spec text for that section
files/{fileId}                      an uploaded PDF's name, size and chunk count
files/{fileId}/chunks/{n}           ~600 KB of that PDF, base64 encoded
```

Sections are separate documents so two people editing different sections at the
same time cannot overwrite each other.

The spec text — the submittal requirements and the scope list — sits in its own
document rather than on the section. It never changes and is only needed when a
section's panel is open, so keeping it out of the section keeps the register
light: across the sample manual that is 197 KB of text against 12 KB of actual
log data. Sections are also written field by field, so ticking a status sends
the status, not the whole record.

A Firestore document holds just under 1 MiB, so each uploaded PDF is base64
encoded and split across chunk documents of 600 KB. Chunks are written once and
never change, which means reads are served from the SDK's local cache and cost
nothing after the first time.

Anything written by an earlier version still works. Sections that carry their
spec text inline are moved across the first time the job is opened: the copy is
written and read back from the server before the inline fields are removed, so
an interrupted run leaves the data exactly as it was.

### The free-tier ceiling

Firestore's free plan stores **1 GiB total**, and only uploads count against it.
The jobs page shows what is used and warns past 70%, each upload area shows the
headroom, an upload over 25 MB offers the link route first, and anything that
would cross the line is refused rather than half-written. Keeping submittal
packages in ShareFile and linking them is what keeps this comfortable — spec
PDFs stay uploaded because the page jumper needs the bytes.

## Local development

```
npx firebase emulators:start --project specs-submittals
```

`index.html` calls `window.__fbConnect(...)` if something has defined it, which
is where a test harness points the app at the emulators. Nothing defines it in
production.
