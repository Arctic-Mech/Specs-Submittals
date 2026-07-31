# Submittal Register — Divisions 22 & 23

A submittal log for mechanical spec sections. Import a project spec PDF, it is
split into its individual Division 22 and 23 sections, and each section carries
a status, the submittal PDFs sent out, and the response PDFs that come back.

The whole app is `index.html`. There is no build step.

## Firebase setup

The register lives in Firestore and the PDFs in Cloud Storage, so every device
on the job sees the same log and changes appear live.

1. **Firestore** — Firebase console → Build → Firestore Database → Create
   database. Any location; the rules below replace whatever mode you pick.
2. **Cloud Storage** — Build → Storage → Get started. New Firebase projects need
   the Blaze plan before a bucket can be created.
3. **Rules** — paste `firestore.rules` into Firestore → Rules and
   `storage.rules` into Storage → Rules, then Publish each.
4. **Authorised domains** — Authentication → Settings → Authorised domains must
   list wherever the page is served from (for GitHub Pages that is
   `<user>.github.io`).

Or, with the Firebase CLI:

```
firebase deploy --only firestore:rules,storage:rules
```

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
```

Sections are separate documents so two people editing different sections at the
same time cannot overwrite each other. PDFs go to
`jobs/{jobId}/specs/{specId}` and
`jobs/{jobId}/sections/{sectionKey}/{docId}`.

## Local development

```
npx firebase emulators:start --project specs-submittals
```

`index.html` calls `window.__fbConnect(...)` if something has defined it, which
is where a test harness points the app at the emulators. Nothing defines it in
production.
