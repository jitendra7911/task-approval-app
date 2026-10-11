# Task & Approval Management App

Full-stack web app where an **Admin** creates and assigns tasks, **Employees** work them through a status workflow, and the Admin approves or rejects the result.

- **Frontend:** React 18 + Vite
- **Backend:** Node.js + Express 4 (REST API)
- **Database:** MySQL 8 (raw parameterized SQL via `mysql2`)
- **Auth:** JWT (bearer token), passwords hashed with bcrypt
- **Tests:** Jest + Supertest

## Live app

**URL:** https://humble-possibility-production-69ce.up.railway.app

## Demo accounts (seeded, demo data only)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@demo.com` | `Admin@12345` |
| Employee 1 | `employee1@demo.com` | `Employee@12345` |
| Employee 2 | `employee2@demo.com` | `Employee@12345` |

The login screen has one-click buttons that fill these demo credentials.

## Workflow rules

```
PENDING --(employee: start)--> IN_PROGRESS --(employee: submit)--> PENDING_APPROVAL
PENDING_APPROVAL --(admin: approve)--> COMPLETED
PENDING_APPROVAL --(admin: reject)---> IN_PROGRESS
```

Every change is stored in `task_status_history` (who, when, from → to, optional note).
Rules live in one place: `backend/src/workflow.js`.

## Features

- Admin & Employee roles; Admin can create users (Users tab).
- Admin: create / edit / delete / assign tasks (title, description, priority, due date), see all tasks.
- Employee: sees **only** their tasks, can comment, start work and submit for approval.
- Admin: approve (→ Completed) or reject (→ In Progress, with optional note).
- Dashboard with counts per status, scoped to the logged-in user's permitted tasks (cards link to the filtered list).
- Filters: status, priority, and (Admin only) employee.

## Local setup

Prerequisites: Node 18+, MySQL 8 (or MariaDB 10.5+).

```bash
# 1. Create an empty database
mysql -u root -p -e "CREATE DATABASE taskapp CHARACTER SET utf8mb4;"

# 2. Configure environment
cp backend/.env.example backend/.env      # then edit values (DB_*, JWT_SECRET)

# 3. Install dependencies
npm run install:all

# 4. Create tables (migrations) and demo data (seed)
npm run migrate
npm run seed

# 5. Run in development (two terminals)
npm run dev:backend      # API on http://localhost:4000
npm run dev:frontend     # UI  on http://localhost:5173 (proxies /api to :4000)
```

Production-style single-process run (Express serves the built React app):

```bash
npm run build && npm start      # http://localhost:4000
```

Note: `npm start` first runs the migrations and the seed, then starts the server. Both are safe to re-run.

Migrations are plain SQL files in `backend/migrations/`, applied in order and tracked in a `schema_migrations` table. The seed is idempotent: it never overwrites existing users.

## Environment variables (names only)

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | **Required.** Long random string used to sign tokens |
| `JWT_EXPIRES_IN` | Token lifetime (default `8h`) |
| `PORT` | HTTP port (default `4000`; hosts usually set this) |
| `DATABASE_URL` | Full MySQL URL (optional alternative to the `DB_*` values) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `DB_SSL` | `true` for managed MySQL that requires TLS |
| `SEED_ADMIN_PASSWORD`, `SEED_EMPLOYEE_PASSWORD` | Optional overrides for demo seed passwords |

`.env` is git-ignored; only `backend/.env.example` (no secrets) is committed.

## Tests

```bash
npm run migrate && npm run seed     # integration tests use the seeded demo users
npm test
```

- `backend/tests/workflow.test.js` – unit tests of the transition/permission rules (no DB needed).
- `backend/tests/api.test.js` – integration tests against MySQL: login failure & 401s, role restrictions (employee cannot create/edit/delete/approve), employee data isolation, full workflow with persistence + history, rejection path, invalid transitions (409), dashboard scoping, filters, input validation.

Point the tests at a throwaway database (`DB_NAME=taskapp_test`) if you do not want to touch real data; tasks created by the tests are deleted afterwards.

> Note: the test suite is included but has not been run against a database yet. The main flows were checked manually on the live app.

## Architecture

```
backend/
  migrations/001_init.sql     users, tasks, task_comments, task_status_history
  src/app.js                  Express app (helmet, JSON parsing, routes, error handler, serves frontend/dist)
  src/auth.js                 JWT sign/verify, authenticate + requireRole middleware
  src/workflow.js             status transition table + permission checks
  src/validate.js             zod schemas for all inputs
  src/routes/                 auth, users, tasks, dashboard
  src/scripts/                migrate.js, seed.js
  tests/
frontend/src/                 App.jsx (Login, Dashboard, Tasks, TaskDetail, TaskForm, Users), api.js, styles.css
```

### REST API (all except login require `Authorization: Bearer <token>`)

| Method & path | Who | Description |
|---|---|---|
| `POST /api/auth/login` | public | Returns `{ token, user }` |
| `GET /api/auth/me` | any | Current user |
| `GET /api/users` · `POST /api/users` | admin | List / create users |
| `GET /api/tasks?status=&priority=&assignedTo=` | any | Employees are always scoped to their own tasks |
| `POST /api/tasks` | admin | Create + assign |
| `GET /api/tasks/:id` | admin / assignee | Task + comments + status history |
| `PUT /api/tasks/:id` · `DELETE /api/tasks/:id` | admin | Edit / delete |
| `POST /api/tasks/:id/comments` | admin / assignee | Add comment |
| `POST /api/tasks/:id/transition` `{action: start\|submit\|approve\|reject, note?}` | per workflow | Status change |
| `GET /api/dashboard` | any | Counts by status, scoped to the user |

### Security notes

- Permissions are enforced in the backend (`requireRole`, ownership check in `loadAccessible`, transition rules in `workflow.js`); hiding buttons in the UI is only cosmetic.
- All SQL uses placeholders (`?`); inputs validated with zod; passwords hashed with bcrypt; login is rate limited and timing-equalised for unknown emails; the user is re-loaded from the DB on every request.
- Status updates use compare-and-set (`WHERE status = <old>`) inside a transaction so concurrent changes cannot corrupt history.
- Secrets only come from environment variables; `helmet` sets security headers.

## Deployment (Railway)

The live app runs on **Railway** (app + MySQL in one project).

1. Push this repo to GitHub.
2. Railway → New Project → *Deploy from GitHub repo*; then add a **MySQL** database to the same project.
3. In the app service → Variables: `JWT_SECRET` (long random string) and `DATABASE_URL` = `${{MySQL.MYSQL_URL}}`.
4. Railway builds with `npm run build` and starts with `npm start`, which runs the migrations and seed and then starts the server.
5. Settings → Networking → *Generate Domain* gives the public HTTPS URL.

Alternative: Render (web service, same commands) + any managed MySQL using the `DB_*` variables and `DB_SSL=true`.

## Known limitations

- JWT is kept in `localStorage` (simple, but an HttpOnly cookie + CSRF protection would be stronger for production).
- No refresh tokens, password reset, email notifications or user edit/delete screens.
- Task list is not paginated (fine for demo-size data).
- Free hosting tiers may sleep when idle, so the first request can be slow.
- Integration tests need a running MySQL with migrations and seed applied, and have not been run yet.
