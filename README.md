# 🩸 Sweety – Blood Glucose Tracker

A small MERN-style app (React + Express + **PostgreSQL**) where a patient records up to 4 blood glucose
readings a day and views daily, month-to-date and previous-month reports.

**Stack:** Node.js 18+, Express 4, PostgreSQL 16 (`pg`), JWT + bcrypt, React 18 (Vite), Recharts, Jest + Supertest, Vitest + React Testing Library.

## Features

- Sign up / log in (passwords hashed with bcrypt, JWT auth), **forgot / reset password**, show-password toggle and confirm-password on signup. Users only ever see their own readings.
- Add, view, edit, delete readings (date, slot, value in mg/dl) with server **and** client validation.
- Reports: highest, lowest, average (1 decimal) and count for Daily / Month-to-date / Previous month, plus a daily readings list and friendly empty states.
- Bonus done: pagination on `GET /api/readings`, line chart (Recharts), docker-compose for PostgreSQL, frontend tests with React Testing Library.

## Project structure

```
server/   Express API  (src/routes, src/services, src/db, tests)
client/   React app    (src/components, src/api.js)
docker-compose.yml     PostgreSQL (+ a second DB for tests)
```

## Install & run

### 1. Database

Option A – Docker (easiest):

```bash
docker compose up -d        # starts Postgres on :5432 with DBs `sweety` and `sweety_test`
```

Option B – local PostgreSQL:

```bash
psql -U postgres -c "CREATE USER sweety WITH PASSWORD 'sweety';"
psql -U postgres -c "CREATE DATABASE sweety OWNER sweety;"
psql -U postgres -c "CREATE DATABASE sweety_test OWNER sweety;"
```

### 2. Server

```bash
cd server
cp .env.example .env        # edit JWT_SECRET / DATABASE_URL if needed (Windows cmd: copy .env.example .env)
npm install
npm run migrate             # creates tables (idempotent)
npm run seed                # demo user + ~75 days of sample readings
npm run dev                 # http://localhost:4000   (npm start for production)
```

Demo login after seeding: **demo@sweety.app / Demo@1234**

### 3. Client

```bash
cd client
npm install
npm run dev                 # http://localhost:5173  (proxies /api to :4000)
```

### 4. Tests

```bash
cd server && npm test       # unit tests always run; API integration tests run when TEST_DATABASE_URL is set
cd client && npm test       # React Testing Library tests for the reading form and auth screens
```

`TEST_DATABASE_URL` is in `server/.env.example`. ⚠️ The integration tests **truncate** the tables of that database — never point it at real data.
Without it, the integration suite is skipped (not failed).

## API

All routes except `/auth/*` (other than `/auth/me`) need `Authorization: Bearer <token>`.

| Method | Route | Notes |
|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` → `{ token, user }` |
| POST | `/api/auth/login` | `{ email, password }` → `{ token, user }` |
| POST | `/api/auth/refresh` | uses the httpOnly refresh cookie → new access token + rotated refresh cookie |
| POST | `/api/auth/logout` | revokes the refresh token, clears the cookie (204) |
| GET | `/api/auth/me` | current user |
| POST | `/api/auth/forgot-password` | `{ email }` → same generic message whether or not the email exists |
| POST | `/api/auth/reset-password` | `{ token, password }` → single-use, expires in 30 min |
| GET | `/api/readings` | `?page=1&limit=20&date=&from=&to=&order=asc\|desc` → `{ data, pagination }` |
| POST | `/api/readings` | `{ date: "YYYY-MM-DD", slot, value }` |
| PUT | `/api/readings/:id` | partial update allowed |
| DELETE | `/api/readings/:id` | 204 |
| GET | `/api/reports?date=YYYY-MM-DD` | daily + monthToDate + monthly (previous month) in one response |

Slots: `morning`, `after_breakfast`, `after_lunch`, `after_dinner`.
Errors are `{ "message": "...", "errors": { field: "..." } }`; validation → `400`, rule conflicts (duplicate slot / max per day) → `409`.

## Validation rules (server + UI)

| Rule | Message |
|---|---|
| Value required | Please enter a glucose value. |
| Whole number 40–600 | Value must be between 40 and 600 mg/dl. |
| One reading per slot per day | You already have an After lunch reading for this date. |
| Max 4 readings per day | You can add only 4 readings per day. |
| No future dates | Date cannot be in the future. |

## Forgot password (demo)

1. On the login screen click **Forgot password?** and enter the account email.
2. No email server is configured, so the server **prints the reset link in its terminal** (`services/mailer.js`; swap in nodemailer/SES/SendGrid for real email).
3. Open the link (`http://localhost:5173/?reset=<token>`), choose a new password, then log in.

## Security

| Area | What is done |
|---|---|
| Passwords | bcrypt (cost 10); min 8 chars with a letter and a number; max 72 (bcrypt limit); never stored or logged in plain text |
| Sessions | Short-lived **access token** (JWT, HS256 only, 15 min) kept in memory and sent as `Authorization: Bearer`; long-lived **refresh token** (random, 7 days) in an `httpOnly`, `SameSite=Lax`, path-limited cookie (`Secure` in production). `JWT_SECRET` is mandatory in production |
| Refresh rotation | Each refresh token works once and is replaced on use; only its SHA-256 hash is stored. Reusing an old token revokes all of that user's sessions. Logout and password reset revoke refresh tokens || Login | Same error for wrong email or password; constant-time compare so timing doesn't reveal which emails exist |
| Password reset | 256-bit random token; only its SHA-256 hash is stored; single-use, 30-minute expiry; a new request invalidates the old link; generic response so emails can't be enumerated |
| Brute force | Rate limit on login, register, forgot and reset (30 requests / 15 min per IP) via `express-rate-limit` |
| HTTP hardening | `helmet` security headers, CORS limited to `CLIENT_ORIGIN`, JSON body limit 10 KB |
| SQL injection | Every query is parameterised; no string-built user input |
| Authorisation | Every readings/reports query is scoped by the logged-in user id; other users' rows return 404 |
| Data integrity | `UNIQUE (user_id, reading_date, slot)` and `CHECK (value BETWEEN 40 AND 600)` enforced by PostgreSQL |
| XSS | React escapes output; no `dangerouslySetInnerHTML` |

## Notes

**Assumptions**
- "Max 4 readings per day" and "one reading per slot" overlap (there are exactly 4 slots). Both are implemented; when a day is full the *max-4* message wins, otherwise a repeated slot gets the *duplicate-slot* message.
- The "previous month" report is the whole calendar month before the selected date's month (selected 15 Oct → 1–30 Sep), as in the example table. Month-to-date includes the selected date.
- "Today" for the future-date rule is the server's local calendar date (the UI also uses the browser's local date). Dates are stored as SQL `DATE`, so there is no timezone drift.
- Report dates in the future are rejected with the same message as reading dates.
- Uses `bcryptjs` (pure-JS bcrypt implementation) to avoid native build issues across machines.
- Editing a reading re-runs every rule, ignoring the row being edited.
- After signup the user is sent to the login screen (no automatic login).
- Password reset emails are not sent in this demo; the link is printed in the server console.
- Data integrity does not rely on the app alone: `UNIQUE (user_id, reading_date, slot)` and `CHECK (value BETWEEN 40 AND 600)` are enforced by PostgreSQL, so concurrent requests can't create duplicates.
- The access token is kept only in memory, so a page reload restores the session through the refresh cookie. The cookie is `SameSite=Lax`, so the API and the app should share a site (the Vite proxy does this in development).

**With more time**
- Real email delivery for password reset; email verification on signup; account lockout and 2FA; a device/session list so users can revoke individual sessions.
- Per-user timezone support; user-defined target ranges with high/low highlighting.
- Migration tool (e.g. node-pg-migrate) instead of a single idempotent `schema.sql`.
- Redis caching for reports, a BullMQ daily reminder job, and a doctor role (listed bonuses I did not attempt).
- Dockerfiles for server and client, CI running both test suites, and Playwright end-to-end tests.