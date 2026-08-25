# Submittal Register — Divisions 22 & 23

A submittal log for mechanical spec sections. Import a project spec PDF, it is
split into its individual Division 22 and 23 sections, and each section carries
a status, searchable tags, the submittal PDFs sent out, the response PDFs that
come back, and what has been released to site.

The whole app is `index.html`. There is no build step.

## Where it saves — two modes

The register has two storage backends, chosen with the **storage button** in the
top-right. The choice is remembered per browser.

- **ShareFile folder (default).** Each job is one folder in ShareFile. The whole
  register is a `register.json` file in that folder and every uploaded PDF is a
  real file beside it, so ShareFile Drive syncs them to everyone exactly like a
  saved spreadsheet. **Chrome or Edge only**, and each machine needs ShareFile
  Drive (or any sync that makes the job folder a normal local folder). There is
  no cloud database and no storage ceiling beyond the disk.
- **Firebase (off by default).** The original shared-cloud store with live
  sync. Kept so jobs saved before the switch stay reachable — flip the toggle to
  open them. A **Save to ShareFile** button (shown in Firebase mode) writes the
  open job — register, spec text, and every PDF — into a folder you pick, so a
  Firebase job can be seeded into ShareFile as a starting point. After it saves,
  switch storage to *ShareFile folder* to work from the folder copy.

### ShareFile-folder mode

Opening the app shows **Open a job folder**. Pick a job's folder:

- A folder that already has a `register.json` opens straight into the job.
- An empty folder starts a new job — name it, import the spec, and the app writes
  `register.json`, the spec PDF, and a launcher shortcut into the folder.

**Saving is automatic.** Every change writes `register.json` as you work (the
header shows *Saving… → Saved ✓*); ShareFile syncs it up. There is no Save
button. To pull in a coworker's synced changes, press **Reload** — folder mode
doesn't push live like Firebase did. Two people editing at once is last-write-
wins; ShareFile may occasionally leave a `register (conflicted copy).json` to
tidy up.

**Launching from the folder.** Each job folder carries an `Open Register.html`
launcher pointing at the hosted app with that job's id. Double-clicking it opens
the default browser and redirects to the app on that job — as close to "open it
from the folder" as a browser allows. (It is a `.html` redirect rather than a
Windows `.url` shortcut because the File System Access API refuses to create
`.url`/`.lnk` files — it blocks shortcut and executable extensions.) A browser
still can't *save* from a double-clicked `file://` page, so the app itself is
always opened from its web address. The launcher opens in the machine's default
browser, which must be Chrome or Edge. The first time each person opens a given
job they pick its folder once; after that it's a single permission click. If the
launcher can't be written for any reason, the folder is still fully usable — just
open the app and use **Open a job folder**.

## Firebase setup

Firebase is the alternate backend. These steps only matter if you use it.


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

Search covers the section number, the title, description, spec, manufacturer,
tags, vendor, package, notes, release labels and document names.

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
of it released. Approving a section moves it to **Ready to Release**. Setting it
to **Released** records a full release there and then, so there is always a date
to run the lead time from. A section that never gets released — furnished by
others, or deleted from scope — can have its release set to **N/A**.

Lead time is free text and takes a range: `6`, `6-7`, `6 to 8`, `10 weeks`. A
range gives a delivery window rather than a single date. Filling the lead time
in after a release re-dates that release, unless the delivery date was typed in
by hand — an override is never overwritten. The expected arrival can be entered
directly: with a single release the **Expected delivery** field in the section
panel is a date you type into (marked *by hand*), and any release's date can be
set in its own release editor.

Recording a release asks whether it finishes the section (the default) or is
only part of it — "Phase 1 — TU boxes". A section can hold as many releases as
it takes, and the main page names each one with its release date and delivery
window, not just a count.

Each release has a **delivered** tick, on the main page as well as in the
section panel. It records only that the thing arrived — no date is asked for
and none is invented.

The main page carries the section number, title, a one-line description, the
spec, the vendor, the status and the release. Clicking a row opens the section;
the small **pencil** on a row turns its title, description, spec and vendor into
inline fields so you can edit them right there without opening the panel (the
tick puts the row back). Status and release are always live on the row. The
manufacturer, the submittal and response counts, and the spec page reference live
in the section panel, where they are actually used.

Rows are a uniform height, so a section with several releases is no taller than
one with none: the main page shows the first couple of releases with a "+N more"
line, and the section panel lists them all.

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

**ShareFile-folder mode** — one job folder holds:

```
register.json          the whole job: meta + sections (spec text inline) + file index
files/<fileId>.pdf     each uploaded submittal / response / spec PDF, as a real file
Open Register.html     the launcher (a redirect) that opens the hosted app for this job
```

**Firebase mode** — Firestore documents:

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

### The free-tier ceiling (Firebase mode only)

Folder mode has no such ceiling — files live on disk and in ShareFile.
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
is where a test harness points the app at the emulators (in Firebase mode).
Nothing defines it in production. The Firebase suite sets
`localStorage.sr_storage_mode = 'firebase'` before load; the folder-mode suite
(`jstest/folder.js`) injects a mock `showDirectoryPicker` and drives the whole
register.json / files / launcher / Reload flow without a real folder dialog.
