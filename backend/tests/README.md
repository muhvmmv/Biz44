# API tests

End-to-end checks of the API against a real PostgreSQL database: stock (FIFO,
locations, returns, counts), the double-entry ledger and reports,
manufacturing, VAT, statements and permissions. Every figure is checked
against a value worked out by hand.

```bash
cd backend
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/biz44_test npm test
```

Run only some suites by passing part of the file name:

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/biz44_test npm test -- 04
```

What the runner does:

1. Applies the migrations to `TEST_DATABASE_URL` (`prisma migrate deploy`).
2. Starts the API on port 4199 (`TEST_PORT` changes it).
3. Runs each file in `tests/suites` in order. Each suite registers its own
   new company, so existing rows are never changed.
4. Stops the API and prints a summary. The exit code is 1 if any check failed.

As a guard, the database name must contain `test`. Never point the tests at
production data.

The same suites run in GitHub Actions on every pull request
(`.github/workflows/ci.yml`), with type checks, a migration drift check and the
frontend build.

## Writing a suite

A suite is a plain Node ES module. Use `process.env.TEST_API_URL` as the API
base URL, print `PASS name` or `FAIL name -> detail` for each check, end with
`N passed, M failed`, and exit with code 1 on failure. For raw SQL, import
`sql` from `../db.mjs`.
