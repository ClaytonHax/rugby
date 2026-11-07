# Tryline build spec

Tryline is player registration and match administration for Zimbabwean high school rugby: an original
product, with its own name and look. Primary users work on phones on school fields with weak signal.
It is independent: never use a union's or school's logo, and never claim endorsement by any body.

Stack: React 19 + TypeScript + Vite, react-router-dom, Tailwind v4 (`@tailwindcss/vite`), lucide-react,
Firebase Auth + Firestore. No backend and no Firebase Storage.

Read before writing code: `src/lib/types.ts` (data contract), `firestore.rules` (what the database permits),
`src/lib/eligibility.ts`, `src/lib/firebase.ts`. Do not change `firestore.rules` or `types.ts` without saying so
in your final report. Your queries must satisfy the rules: school-level users MUST filter
`where('schoolId','==',mySchoolId)` when listing players, staff, documents, rosters, invites or users.

## Roles
- union_admin: everything, invites anyone, edits settings, can correct final results.
- registrar: verifies/rejects/suspends players and staff, approves team sheets, sees all schools.
- school_admin: runs one school; invites coach/manager/scorer; teams; records; can open ID documents.
- coach, manager: register players and staff at their school, build squads and sheets, record results. Cannot view ID document bytes.
- scorer: records match events for assigned school, or all schools if schoolId is null.
- Public (no login): fixtures, results, logs, school directory, match pages. No personal data except initial + surname on scoring events.

## Onboarding (no public self-registration of roles)
Admin creates `invites/{email}`. Invitee signs up with email+password, verifies email, and the app then claims the
invite in one batch: create `users/{uid}` copying role + schoolId, delete the invite. A verified user with no invite sees a
"no access yet" screen. Inactive users are signed out with a message.

## Required behaviour
1. Registration: player fields per `Player`; staff per `Staff`. Photo plus one ID document (birth certificate, national ID or passport) are required before a record may move draft -> pending, and so is guardian consent for players. Coaches and managers are registered the same way.
2. Duplicate prevention: SHA-256 of `${idType}:${idNumber uppercased with spaces and dashes removed}` as `idRegistry/{hash}` `{ ownerType, ownerId, schoolId }`. If it exists, block and say which it conflicts with (not revealing the other school's data beyond "already registered"); create it with the record.
3. Verification queue (registrar/union): view photo and documents side by side with the record; verify (sets status, registrationNo `TL-<year>-<6 upper-case alphanumerics>`, verifiedBy, verifiedAt), reject with mandatory reason, suspend with reason, reinstate. Every action writes `auditLogs`.
4. Over-age rule: at most `settings/competition.maxOverAge` players with `ageOn(dob, date) > overAgeYears` per team. Enforce when adding to a roster (using today, in a transaction updating `teamRosters.overAgeIds`) and on team sheets (using the match date). Show the current count as x/3 prominently, and block with a clear error naming the over-age players.
5. Only `verified` players and staff can be added to a roster or team sheet. Others appear with their status and a link to finish registration.
6. Team sheets: `matches/{id}/sheets/{teamId}`. Built by picking from the roster; jersey 1-15 starters, 16-23 replacements; must have a captain; at least 15 to submit, at most 23. Also an upload path: paste/upload CSV or a list of names (one per line, optional jersey) that is matched to registered players; every unmatched or unverified name is listed and blocks submission with a link to register them. Optional scanned sheet upload (photo/PDF, type `team_sheet`). Flow: draft -> submitted -> approved/rejected by registrar with note. Rejected sheets may be edited by the school: the current rules block this from `rejected`, so a school re-creates by asking the registrar to set it back to draft (provide this registrar action).
7. Matches: date, kickoff, venue, town, competition, age group, two teams, referee. Score events update `homeScore/awayScore` in a batch with the event; points from `SCORE_POINTS`. Scorer entered for a try etc comes from the team sheet if there is one, else the roster. Store `playerDisplay` from `publicName`. Cards go to the private `cards` subcollection. Marking final locks it for all but union (rules enforce).
8. Logs: public standings per age group and season, computed from final matches: P W D L PF PA PD Pts (4 win, 2 draw, 0 loss; no bonus points).
9. Audit log viewer, compliance page (recomputes over-age counts for all teams from DOBs and flags breaches, plus records with missing documents), CSV exports of a squad and of a school's register.
10. Documents: use `src/lib/documents.ts` only.

## Documents (Firestore-chunked, because no Storage bucket exists)
`documents/{ownerType_ownerId_type}` + `chunks/{i}` `{ data: Bytes }` at most 900 KiB each. Upload order: delete old chunks, write
metadata with `complete:false`, write chunks one by one, set `complete:true`, then add type to `docTypes` on the person. Images are
compressed in the browser first (canvas, longest side 1600px, JPEG quality 0.8; photos 800px). PDFs are stored as-is, 5 MB maximum. Show
upload progress. The upload must work from a phone camera (`accept="image/*,application/pdf"`, `capture` not forced). Download
reassembles into a Blob and shows it through an object URL. Never put document bytes anywhere public or in logs.

## Design
Original, confident, and practical. A serious tool for tired teachers on a touchline, not a SaaS template.
- Colours in CSS variables/Tailwind theme: pitch green `#0B4F3C` primary, deep ink `#10201B`, chalk `#F6F4EC` page, white surfaces, gold `#E0A526` accent, red `#B3261E` error, status colours for draft (grey), pending (amber), verified (green), rejected (red), suspended (dark red).
- Type: "Barlow Condensed" (600/700) for headings, scores, numbers; "Inter" for body. Load from Google Fonts in `index.html`. Scores and jersey numbers are large, tabular.
- Mobile-first: bottom tab bar on phones, left sidebar from `md` up. Tap targets 44px or more. No horizontal page scroll at 360px; tables collapse to cards on phones.
- Use real empty states with a next action, loading skeletons, and inline form errors in plain language. Accessible labels and focus states. No emoji icons; use lucide-react.

## Code conventions
Functional components, strict TS with no `any`. Pages in `src/pages/<area>/`, shared UI in `src/components/ui/`, data access in `src/lib/`.
Keep files focused. Do not commit or push; the lead does this. Do not touch files outside your scope. `npm run build` must pass for your files.
Do not create placeholder pages that pretend to work. Do not add fake players or fake results anywhere.
