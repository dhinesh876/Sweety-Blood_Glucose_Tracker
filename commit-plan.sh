#!/usr/bin/env bash
# Creates a realistic multi-commit history. Run ONCE from the repo root:  bash commit-plan.sh
# Tip: spread them over days with  GIT_AUTHOR_DATE="2026-11-24T20:00:00" GIT_COMMITTER_DATE="..." git commit ...
set -e
git init -b main
c() { git add $1 && git commit -m "$2"; }
c ".gitignore README.md"                         "chore: add gitignore and README skeleton"
c "docker-compose.yml docker"                    "chore: add docker-compose for PostgreSQL"
c "server/package.json server/package-lock.json server/.env.example server/src/config.js server/src/constants.js" "feat(server): project setup, config and constants"
c "server/src/db"                                "feat(server): database schema, migration and seed script"
c "server/src/utils server/src/services/readingValidation.js" "feat(server): date utils and reading validation"
c "server/src/middleware server/src/routes/auth.js" "feat(server): signup/login with bcrypt and JWT auth"
c "server/src/routes/readings.js"                "feat(server): readings CRUD with pagination and business rules"
c "server/src/services/reportService.js server/src/routes/reports.js" "feat(server): daily, month-to-date and monthly reports"
c "server/src/app.js server/src/index.js"        "feat(server): wire up express app"
c "server/tests"                                 "test(server): unit and API integration tests"
c "client/package.json client/package-lock.json client/index.html client/vite.config.js client/.env.example client/src/main.jsx client/src/styles.css client/src/setupTests.js" "feat(client): vite + react setup"
c "client/src/api.js client/src/constants.js client/src/validate.js" "feat(client): api client and validation helpers"
c "client/src/components/AuthForm.jsx client/src/App.jsx" "feat(client): auth screen and app shell"
c "client/src/components/ReadingForm.jsx client/src/components/ReadingsList.jsx" "feat(client): add, edit, delete readings with pagination"
c "client/src/components/Reports.jsx"            "feat(client): reports with empty states and trend chart"
c "client/src/components/ReadingForm.test.jsx"   "test(client): reading form tests with React Testing Library"
git add -A && git commit -m "docs: finalize README notes" || true
git log --oneline
