# The Dingus

A job workspace for mechanical projects (Arctic Mechanical). Each job has five
tabs:

- **Submittals** — import a project spec PDF, it is split into its individual
  Division 22 and 23 sections, and each section carries a status, searchable
  tags, the submittal PDFs sent out, the response PDFs that come back, and what
  has been released to site. Sections in any other division (07, 21, 26, …) can
  be added by hand; the register opens on the **All** view and shows a tab per
  division present.
- **RFIs** — a register of RFIs, each holding the question PDF you sent and the
  response PDF that came back, with a status (Open → Submitted → Answered →
  Closed), the sent / due / answered dates, the GC's own RFI number, and its own
  action-item checklist.
- **Change Orders** — a log of change orders with an amount and status
  (Pending → Submitted → Approved / Rejected), the CO PDF, and a **Paid** tick you
  check off — on the row or in the drawer — when it's actually paid.
- **Job Tracking** — categories you create (scheduling, owner correspondence,
  whatever the job needs), each holding emails and files you drop in, action-item
  checklists, and notes.
- **Billing** — a placeholder for now; to be built out.

The whole app is `index.html`. There is no build step.

It works on a phone as well as a desktop: on narrow screens the header collapses
to icon buttons and the register table becomes a stack of tap-to-open cards, each
showing the section, status and releases without any sideways scrolling. (Loading
a ShareFile folder to view or add PDFs still needs desktop Chrome or Edge.)

**Names read officially.** When you leave a single-line name field — a subject, a
vendor, a description, a job or category name — it's tidied to Capitalise The
First Letter Of Every Word. Only the first letter of each word changes, so
acronyms (VFD) and codes (GC-RFI-042) keep their case, and numbers, amounts,
dates, search boxes and free-text notes are left exactly as typed.

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
drops a clearly-named marker and a `READ ME - do not delete.txt` and keeps its
PDFs under `files/` there. This
needs **Chrome or Edge** and the folder available locally (ShareFile Drive, or
any sync that makes it a normal folder).

The folder is **remembered per machine**, so you only pick it once. When you
reopen the site later, opening the job recognises that folder: the browser can't
silently reuse the permission across sessions, so the app tries to confirm it
right away (a one-time "let this site edit files?" prompt), and if that doesn't
fire it shows a **Reconnect to "&lt;folder&gt;"** bar — a single click, no
re-picking. Only the very first time on a machine do you browse to the folder.

Because the folder is per machine, **each person loads it once on their own
computer** — the register syncs live through the cloud, but the PDFs come from
whoever's machine has the folder loaded. If you open a job and its PDFs won't
show, that just means the folder isn't loaded yet: click **Load ShareFile
folder**. If a PDF still won't open after loading, check you picked the right
folder (the app warns if the folder is marked for a different job), and in
ShareFile make the folder **available offline** so its files have downloaded.

The loaded-folder bar shows how many PDFs it can actually read — a count, or a
highlighted **no PDFs found here** if you've connected to the wrong or unsynced
folder.

### Dropping files into the folder directly

You can also work from the other direction: drop files straight into the job's
ShareFile folder (from Explorer/Finder, or ShareFile itself). Next time the folder
loads, the app notices anything the register doesn't reference and the bar shows
**"N new files to assign."** The **Assign** button walks them one at a time:

- A **PDF** → pick its **spec section**, whether it's a **submittal or response**,
  and its **status**; *Assign & file* moves it into the matching status subfolder
  and records it on that section.
- An **email** (`.msg`/`.eml`) → pick a **Job Tracking category** (or make a new
  one); *File in category* moves it under `files/Emails/<category>/` and records it
  there.

**Skip** leaves one for later; **Ignore** marks a file as "not mine" so it stops
asking. Anything the register already references — every filed submittal, RFI,
change order and email — is recognised and left alone, wherever it sits in the
folder tree.

### Save to folder

The **Save to folder** button (top of a job) writes a complete copy of the
register into the ShareFile folder, overwriting the previous one:

- **`Submittal Register - data (do not delete).json`** — a full machine-readable
  snapshot of the job (every section, its statuses, releases, tags, spec text,
  and PDF references).
- **`Submittal Register.csv`** — the register as a clean submittal-register
  spreadsheet ready to send to a GC: a title block (project, job no., date),
  columns grouped by division, US-format dates, readable statuses and lead times,
  and every release listed. The ⤓ **Export** button offers the same register as
  either a **branded PDF** (Arctic letterhead, grouped by division, colour-coded
  statuses — ready to send to a GC or PM) or this **CSV** spreadsheet.
- It also **re-files the PDFs** so each one sits under the status subfolder it
  belongs to, keeping its original name — repairing anything that got moved, and
  pulling any older flat files into the sorted layout.

### Named so nobody deletes them

The app's own files in a job folder are given obvious, self-explanatory names so a
coworker browsing ShareFile can see what they are: the job marker is
`The Dingus - job link (do not delete).json`, the data backup is
`Submittal Register - data (do not delete).json`, and a plain-text
`READ ME - do not delete.txt` at the folder root explains everything and warns
against deleting. The marker and the READ ME are **self-healing** — if someone
deletes them, the app recreates them the next time the folder loads (and the
register data/CSV are rewritten on the next **Save to folder**). Folders created
under the old cryptic names (`job.json`, `register.json`, `register.csv`) are
renamed to these automatically on the next load.

The app can't set ShareFile permissions from the browser, so it can't *stop*
deletions outright — to truly lock the files, set the folder (or those files) to
restrict delete/edit in **ShareFile's own folder permissions**. The PDFs
themselves can't be auto-restored if deleted, so that's the belt-and-braces step.

The register already syncs live to the cloud, so the folder copy is for keeping a
self-contained, offline copy in ShareFile alongside the PDFs. It never deletes
PDFs it doesn't recognise.

## RFIs

The **RFIs** tab is a lightweight RFI log that works like the submittal log. Each
RFI has an Arctic number (auto-suggested, editable), the **GC's own RFI number**
(the GC assigns its own, which won't match ours — it shows in the register's
GC # column), a subject, a status that runs
**Open → Submitted → Answered → Closed**, and the sent / due / answered dates. It holds two kinds of PDF: the **question** (the RFI as you sent it out)
and the **response** (the stamped answer that came back). Uploading a question
PDF moves an open RFI to **Submitted**; uploading a response moves it to
**Answered** and stamps the answered date. You can drag a PDF straight onto the
question or response drop zone, or use the **Upload PDF** button. The PDFs are
filed into the job's ShareFile folder under `files/RFI Questions/` and
`files/RFI Answers/`. Search and the status chips work the same as on the
submittal tab.

**No PDF?** Each of the question and response sections also has a text box — type
the RFI question or the response straight in when there's no PDF to attach. The
text is kept on the RFI and is searchable.

Each RFI also carries its own **action items** — the same checklist as Job
Tracking (below) — for things like cost impact or schedule impact that need
chasing down. The RFI row shows how many are still open.

## Change Orders

The **Change Orders** tab logs each CO with an **amount**, a **description**, a
status (**Pending → Submitted → Approved / Rejected**), the submitted / approved
dates, the CO PDF, any **emails** attached to the CO (`.msg`/`.eml`), notes, and
action items. Each change order gets **its own folder** under `files/Change
Orders/` named `CO <number> - <description>`, holding its PDFs with an **Emails**
subfolder for its emails. Existing jobs are reorganised into this layout
automatically on the next load or **Save to folder**, and renaming a CO moves its
files into the new folder and clears the empty old one. Emails are added in the CO drawer (upload or drag-drop), and a loose
email dropped in the folder can be **assigned to a change order** from the Assign
prompt (alongside filing it under a Job Tracking category).

**Emails open in a built-in viewer.** Clicking **Open** on any loaded email —
on a change order, in Job Tracking, or in the Assign prompt — shows the sender,
recipients, subject and message body right in the app, so you don't have to
download it or open a separate mail program. `.eml` files are read in full;
Outlook `.msg` files are read best-effort (sender/subject/body), with a
**Download** button always available as a fallback.
**Paid is tracked separately** as its own tick — because a CO is usually approved
well before it's paid — so you check it off (on the row or in the drawer) when the
money comes in, and it records the paid date. The register footer totals the CO
amounts and how much has been paid, and the status chips include a **Paid** filter.

## Job Tracking

The **Job Tracking** tab is for everything on a job that isn't a submittal or an
RFI. You make **categories** — change orders, scheduling, owner correspondence,
long-lead tracking, whatever the job needs — and each category holds three
things:

- **Emails & files** — drop email conversations or any file onto the drop zone,
  or use **Upload**. Browsers can't accept a message dragged straight out of the
  Outlook inbox, so first drag the message to your desktop (Outlook saves it as a
  `.msg`) or use **Save As**, then drop that file in. `.msg`/`.eml` emails, their
  attachments and PDFs all work. Files land under
  `files/Emails/<category>/` in the ShareFile folder — a PDF opens in the viewer,
  an email downloads so Outlook can open it.
- **Action items** — a checklist you can tick off; the category shows how many are
  still open. **Click an item to open it** and add a due date and a details note
  (cost, schedule impact, who owns it) — a 📝 marks items that have details, and
  the due date shows on the row, amber on the day and red once overdue.
- **Notes** — quick dated notes.

Categories, checklists and notes sync live through the cloud like the rest of the
register; only the uploaded files live in the ShareFile folder.

## Billing

The **Billing** tab is a placeholder for now — the shape (progress billing /
schedule of values / retention / invoices) will be designed and built out later.

## Managing the spec

The spec is reached from one place: the **Spec** button (top-right). It lists the
job's spec files — click one to open it, remove one, or **Import another spec**.
There is no separate import button. The first spec is imported when you create the
job (or from the submittals empty state on a job that has none).

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
Partial Approval → Approved, with Revise & Resubmit, Revision Requested,
Revision Sent and Not Required alongside.

In a section, the **status selector is collapsed** behind a *Change* toggle
(the current status shows as a pill). **Notes** sit right below the responses;
tick **Pin this note on the register row** to surface a note on the main table
row (a 📌 callout), and the notes box grows as you type. Both the submittals
table and the RFI list can be **sorted by latest response date** instead of by
number, from the sort dropdown in each toolbar.

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
**manufacturer**, the vendor, the status and the release (with the date the
status/release last changed). Clicking a row opens the section; the small
**pencil** on a row turns its title, description, manufacturer and vendor into
inline fields so you can edit them right there without opening the panel (the
tick puts the row back). Status and release are always live on the row. The
submittal and response counts live in the section panel.

When a newer PDF is uploaded for a section (a revised submittal, say), the
previous one is renamed with an **"OLD - "** prefix and moved into a
**Submittals/Archive/** folder, so the live status folders only ever hold the
current PDFs while the superseded revisions stay together, out of the way but not
lost. (Older folders created before this get tidied into Archive automatically on
the next load or **Save to folder**.) A **Submittals/All Submittals/** folder also keeps a per-section snapshot: one
subfolder per spec section that has a PDF, holding that section's **current PDF**
(submittal or response) named by status (e.g. `Approved - Valve.pdf`), plus a
nested **Archive/** folder with a labelled copy of every superseded PDF for that
section. It's for grabbing everything at once, browsed by section (double-stored
on purpose).

A section can hold several releases (phase 1, phase 2, …) and **every one of them
shows on the row** — each with its release date, delivery window and delivered
tick — so a partially-released section reads at a glance. The row grows to fit
them all.

The spec PDF is reached only from the **Spec** button in the top-right (it opens
the file, or lists them if there is more than one); there is no spec bar above the
division selector. **Import spec** (also top-right) adds another.

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

Each PDF row has a **✎ rename** (renames the on-disk file and the record) and a
**⤓ download**. A loose PDF dropped in the folder can be assigned to **a
submittal section or an RFI** (as its question or response) in the Assign wizard.

**Export responses.** The **⤓ Export responses** button (submittals toolbar)
zips the most-recent response PDF of every submittal *currently shown in the
view* into one download. Filter the table however you like — e.g. the **Revise &
Resubmit** status chip plus a vendor search like **JBO** — hit export, and you
get a single zip of exactly those returned responses to send straight to that
vendor.

**Open in Bluebeam.** On a laptop where you'd rather mark PDFs up in Bluebeam
Revu, tick **Open in Bluebeam** in the folder bar. With it on, opening a PDF
downloads it (so it opens in your desktop PDF app) instead of showing the inline
viewer — set Bluebeam as your default PDF app so it opens automatically. It's a
per-machine setting.

ShareFile's own API is not used and cannot be: its OAuth needs a server-side
client secret and its endpoints send no CORS headers, so a static page is
blocked. A link, and the File System Access folder, need none of that.

## Data

**The register — Firestore documents:**

```
jobs/{jobId}                        name, number, ShareFile folder name, spec files, roll-up
jobs/{jobId}/sections/{sectionKey}  the log: status, tags, lead time, releases, document refs
jobs/{jobId}/specdata/{sectionKey}  the spec text for that section
jobs/{jobId}/rfis/{rfiId}           an RFI: numbers, subject, status, dates, checklist, PDF refs
jobs/{jobId}/tracking/{catId}       a tracking category: files, checklist, notes
jobs/{jobId}/changeorders/{coId}    a change order: number, amount, status, paid+date, PDF refs
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

**The PDFs — in each job's ShareFile folder, under a parent folder per feature:**

```
<job folder>/Open The Dingus.html                            double-click to open the tool at this job
<job folder>/The Dingus - job link (do not delete).json  links this folder to the job
<job folder>/Submittal Register - data (do not delete).json  register data backup
<job folder>/Submittal Register.csv                       the register as a spreadsheet
<job folder>/READ ME - do not delete.txt                  what all of this is
<job folder>/files/Submittals/Specs/<name>.pdf           the imported spec PDFs
<job folder>/files/Submittals/All Submittals/<section>/            the section's current PDF, named by status
<job folder>/files/Submittals/All Submittals/<section>/Archive/   that section's past PDFs, named by status
<job folder>/files/Submittals/Archive/<name>.pdf         superseded PDFs ("OLD - …"), old revisions
<job folder>/files/Submittals/Submitted to GC/<name>.pdf submittals sent to the GC
<job folder>/files/Submittals/Approved/<name>.pdf        approved responses
<job folder>/files/Submittals/Revise and Resubmit/<name>.pdf
<job folder>/files/Submittals/Partial Approval/<name>.pdf
<job folder>/files/Submittals/Waiting on Vendor/<name>.pdf
<job folder>/files/RFIs/<RFI# - subject>/Question/<name>.pdf   the RFI as sent out
<job folder>/files/RFIs/<RFI# - subject>/Answered/<name>.pdf   its response (empty until one arrives)
<job folder>/files/Change Orders/<CO# - desc>/<name>.pdf        one folder per change order — its PDFs
<job folder>/files/Change Orders/<CO# - desc>/Emails/<name>    emails attached to that change order
<job folder>/files/Emails/<category>/<name>              tracking emails and files, by category
```

Opening `files/` shows four parent folders — **Submittals**, **RFIs**,
**Change Orders** and **Emails** — with the submittal statuses nested under
Submittals; under RFIs, **one folder per RFI named "<RFI# - subject>"** (as shown
on the website), each holding a **Question** and an **Answered** subfolder
(Answered stays empty until a response comes back); and under Change Orders, **one
folder per CO named "CO <number> - <description>"**, each holding its PDFs and an
**Emails** subfolder. A job whose files were in an older layout (the loose status
folders, the flat RFIs/Questions & RFIs/Answers buckets, or CO files loose in
Change Orders) is reorganised into this structure automatically the next time its
folder loads, and **Save to folder** keeps it tidy — renaming an RFI or CO moves
its files into the new folder and clears the empty old one.

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
