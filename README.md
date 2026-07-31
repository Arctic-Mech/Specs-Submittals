# Submittal Register — Divisions 22 & 23

A submittal log for mechanical spec sections. Import a project spec PDF, it is
split into its individual Division 22 and 23 sections, and each section carries
a status, the submittal PDFs sent out, and the response PDFs that come back.

The whole app is `index.html`. There is no build step.

## Firebase setup

The register lives in Firestore, and so do the PDFs. Cloud Storage would be the
natural home for them, but it needs a billing account — Firestore does not, so
files are split into chunk documents instead. Nothing here costs anything on
the free Spark plan.

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

## Data

```
jobs/{jobId}                        name, number, spec files, status roll-up
jobs/{jobId}/sections/{sectionKey}  one document per spec section
files/{fileId}                      a PDF's name, size and chunk count
files/{fileId}/chunks/{n}           ~600 KB of that PDF, base64 encoded
```

Sections are separate documents so two people editing different sections at the
same time cannot overwrite each other.

A Firestore document holds just under 1 MiB, so each PDF is base64 encoded and
split across chunk documents of 600 KB. Chunks are written once and never
change, which means reads are served from the SDK's local cache and cost
nothing after the first time.

### The free-tier ceiling

Firestore's free plan stores **1 GiB total**. The jobs page shows how much of
that the PDFs are using and warns past 70%. Uploads that would cross the line
are refused rather than half-written. Roughly, that is one spec manual plus a
few hundred megabytes of submittals — delete finished jobs to make room, or
move to Blaze and switch back to Cloud Storage when it stops being enough.

## Local development

```
npx firebase emulators:start --project specs-submittals
```

`index.html` calls `window.__fbConnect(...)` if something has defined it, which
is where a test harness points the app at the emulators. Nothing defines it in
production.
