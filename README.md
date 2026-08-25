# Submittal Register — Divisions 22 & 23

A submittal log for mechanical spec sections. Import a project spec PDF, it is
split into its individual Division 22 and 23 sections, and each section carries
a status, searchable tags, the submittal PDFs sent out, the response PDFs that
come back, and what has been released to site.

The whole app is `index.html`. There is no build step.

## Where it saves

Two places, split by what the data is:

- **The register — statuses, vendors, dates, tags, releases — lives in the cloud
  (Firestore).** It is the default: the app opens on the jobs grid, everyone sees
  the same register, and changes appear live. It is small text, so it is free
  forever on the Spark plan.
- **A job's PDFs live only in that job's ShareFile folder.** Submittals,
  responses and spec PDFs are never uploaded to the cloud — they are written into
  a ShareFile folder you load. **To view or add a job's PDFs, load its folder
  first.** The app shows a bar on every job saying whether the folder is loaded,
  with a **Load ShareFile folder** button when it isn't.

### Loading a job's ShareFile folder

Open a job, then **Load ShareFile folder** and pick that job's folder. The app
drops a small `job.json` marker and keeps its PDFs under `files/` there. The
folder is remembered per machine, so after the first time it opens with a single
permission click. This needs **Chrome or Edge** and the folder available locally
(ShareFile Drive, or any sync that makes it a normal folder).

Because the folder is per machine, **each person loads it once on their own
computer** — the register syncs live through the cloud, but the PDFs come from
whoever's machine has the folder loaded. If you open a job and its PDFs won't
show, that just means the folder isn't loaded yet: click **Load ShareFile
folder**. If a PDF still won't open after loading, check you picked the right
folder (the app warns if the folder is marked for a different job), and in
ShareFile make the folder **available offline** so its files have downloaded.

### Save to folder

The **Save to folder** button (top of a job) writes a complete copy of the
register into the ShareFile folder, overwriting the previous one:

- **`register.json`** — a full machine-readable snapshot of the job (every
  section, its statuses, releases, tags, spec text, and PDF references).
- **`register.csv`** — the same register as a spreadsheet you can open in Excel.
- It also **re-files the PDFs** so each one sits under the status subfolder it
  belongs to, keeping its original name — repairing anything that got moved, and
  pulling any older flat files into the sorted layout.

The register already syncs live to the cloud, so this is for keeping a
self-contained, offline copy in ShareFile alongside the PDFs. It overwrites
`register.json`/`register.csv` each time and never deletes PDFs it doesn't
recognise.

## Firebase setup

The register lives in Firestore. Nothing here costs anything on the free Spark
plan — the register is text, and the PDFs are in ShareFile, not the cloud.

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

An uploaded PDF is written into the job's ShareFile folder (so the folder has to
be loaded first) and views inline. A link is just a URL kept on the section — it
opens in a new tab and needs no folder loaded, which is handy for big vendor
packages that already live in ShareFile. Each section's panel offers both.

**Every upload picks a status.** When you add a PDF you must say what it is —
Submitted to GC, Partial Approval, Approved, or Revise & Resubmit. That does
three things: it becomes the **section's current status** (the newest upload
always wins, so the main page shows the most recent), it is recorded in the
section's history so the trail of what happened is kept, and it sorts the PDF
into a subfolder named for that status inside the ShareFile folder. Each file
row shows its status and which folder it landed in.

ShareFile's own API is not used and cannot be: its OAuth needs a server-side
client secret and its endpoints send no CORS headers, so a static page is
blocked. A link, and the File System Access folder, need none of that.

## Data

**The register — Firestore documents:**

```
jobs/{jobId}                        name, number, ShareFile folder name, spec files, roll-up
jobs/{jobId}/sections/{sectionKey}  the log: status, tags, lead time, releases, document refs
jobs/{jobId}/specdata/{sectionKey}  the spec text for that section
```

Sections are separate documents so two people editing different sections at the
same time cannot overwrite each other. The section record keeps only a *reference*
to each PDF (its id, name and size) — never the bytes.

The spec text — the submittal requirements and the scope list — sits in its own
document rather than on the section. It never changes and is only needed when a
section's panel is open, so keeping it out of the section keeps the register
light: across the sample manual that is 197 KB of text against 12 KB of actual
log data. Sections are also written field by field, so ticking a status sends
the status, not the whole record.

**The PDFs — in each job's ShareFile folder, sorted by status:**

```
<job folder>/job.json                         { id, name } — which job this folder is
<job folder>/files/Specs/<name>.pdf           the imported spec PDFs
<job folder>/files/Submitted to GC/<name>.pdf submittals sent to the GC
<job folder>/files/Approved/<name>.pdf        approved responses
<job folder>/files/Revise and Resubmit/<name>.pdf
<job folder>/files/Partial Approval/<name>.pdf
```

Each PDF keeps its uploaded filename and sits in the subfolder for the status it
was filed under, so the folder reads like a filing cabinet. The section's document
record keeps the subfolder and filename (`dir` + `file`) to find it again. PDFs
never go to Firestore, so the register stays tiny and there is no storage ceiling
beyond the disk. Deleting a job removes only the register — the PDFs in ShareFile
are left alone.

### Storage cost

There is effectively none. The register is text and lives well inside Firestore's
free plan; the PDFs are in ShareFile, not the cloud, so they never count against
any allowance. The only ceiling on PDFs is the ShareFile folder's own disk.

## Local development

```
npx firebase emulators:start --project specs-submittals
```

`index.html` calls `window.__fbConnect(...)` if something has defined it, which is
where a test harness points the app at the Firestore emulator. Nothing defines it
in production. The test suite also injects a mock `showDirectoryPicker`
(`jstest/mockfs.js`) so the per-job ShareFile folder — `job.json`, `files/<id>.pdf`
— can be driven without a real folder dialog. `jstest/flow.js` is the end-to-end
test: import stores the spec in the folder, uploads/views go through it, PDFs
never reach Firestore, and a second browser sees the register live but is prompted
to load the folder for PDFs.
