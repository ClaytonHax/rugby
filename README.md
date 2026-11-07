# Tryline

Player registration and match administration for Zimbabwean high school rugby. Schools register players and staff, union staff verify them, teams build sheets, and results feed the public fixtures, results and standings.

Tryline is an independent product. It is not affiliated with or endorsed by any union or school.

**Live:** https://tryline-zw.vercel.app

## Stack

React 19, TypeScript, Vite, react-router-dom, Tailwind CSS v4, lucide-react, Firebase Auth and Firestore. There is no custom backend and no Firebase Storage.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*` values for the Firebase web app. Never commit `.env.local`.
3. `npm run dev`

Other scripts: `npm run build` (type-check and production build), `npm run lint`.

## Tests

`npm run test:rules` runs the Firestore security rules tests against the local emulator. It needs the Firebase CLI and Java. It uses the `demo-tryline` project id and never touches the live project.

## Roles

- **Union administrator:** everything, including invites, settings and corrections to final results.
- **Registrar:** verifies, rejects and suspends players and staff, and approves team sheets.
- **School administrator:** runs one school, manages its teams and invites its coaches, managers and scorers.
- **Coach and manager:** register players and staff at their school, build squads and team sheets, and record results.
- **Scorer:** records match events for an assigned school, or all schools if none is set.
- **Public:** fixtures, results, standings, school directory and match pages. No personal data.

Access is by invitation only. An admin creates an invite for an email address, and the invitee signs up with that address and goes straight in. There is no email verification step; email ownership is not checked.

## Deleting things

Every delete asks for confirmation and says what will be lost. Who can do what follows the security rules:

- **Team** (union staff, or the school administrator of that school): removes the team and its squad list. Blocked, with the matches listed, while any match uses the team.
- **Team sheet** (school: drafts only; union: any): removes the line-up and its scanned copy.
- **Match** (union administrator): removes the match with its events, cards, team sheets and scans. A final match disappears from public results and the logs.
- **Player or staff record** (union administrator, any status; school administrators can still delete their own drafts): removes the record, its photo and documents, its ID registration and its place in squads. Past team sheets keep their own copy of the name. A verified record needs the surname typed to confirm.
- **School** (union administrator): blocked while it still has teams, players, staff, users or matches.
- **User** (union administrator, not yourself): Remove access deletes the profile. The login itself stays registered; inviting the same email again restores access the next time they sign in. Deactivate is the reversible alternative.

## Install as an app

Tryline is a progressive web app: the shell opens with no signal, and data changes sync when the connection returns.

- **Android / Chrome / Edge:** open Account (or More on a phone) and tap **Install app**, or use the browser's install option.
- **iPhone / iPad:** in Safari tap Share, then **Add to Home Screen**.

The service worker (`public/sw.js`) only handles same-origin requests; Firestore, Auth and documents never pass through it. It is registered in production builds only, never with the emulators. When a new version is ready a "New version available" banner appears and nothing reloads until you tap Reload. Icons were generated from `public/favicon.svg`.

## Data privacy

- Player and staff records contain personal data about minors, so the database is default-deny. Public pages show only school, team and match data, and on scoring events only an initial and surname.
- Identity documents and photos are stored as chunks in Firestore (`documents/{id}` with `chunks/{i}`), each under 900 KiB. Images are compressed in the browser before upload.
- Firestore's free tier gives roughly 1 GiB of storage, which is the practical capacity limit for documents. Firebase Storage is not used because it needs a billed bucket, and keeping documents in the same database keeps access controlled by the same rules.
- Document bytes are never placed in public paths, logs or URLs other than short-lived object URLs shown to authorised users.
- No secrets belong in this public repository. Firebase web config values are read from environment variables. Service account keys, tokens and private keys must never be committed.

## Deploying rules

From the project root, with the Firebase CLI logged in to the right account:

```sh
firebase deploy --only firestore:rules,firestore:indexes
```

Run `npm run test:rules` first. The rules are in `firestore.rules`.
