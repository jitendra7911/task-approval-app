# Short note: AI tools used and what I verified

**AI tools used:** Claude (Anthropic) to scaffold the backend, React UI, SQL schema, tests and documentation.

**What I personally verified** *(edit this to match what you actually did before sending)*:
- Read through all backend code and can explain the permission checks (`requireRole`, `loadAccessible`) and the transition table in `workflow.js`.
- Ran migrations + seed on a clean MySQL database and ran `npm test` (all tests passing).
- Manually walked the full flow in two separate browser sessions: Admin creates/assigns → Employee starts and submits → Admin approves / rejects; refreshed and logged in again to confirm persistence.
- Confirmed role restrictions by calling the API directly (employee token on admin endpoints → 403; other employee's task → 403).
- Confirmed no secrets are committed (`.env` ignored; only `.env.example`).
