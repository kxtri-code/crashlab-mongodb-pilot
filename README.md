# CrashLab MongoDB Pilot Fixture

A standalone, non-Supabase staging test fixture designed for CrashLab black-box testing.

## Architectural Boundaries

- **Zero Database Access by CrashLab:** CrashLab operates strictly at the browser, HTTP, and network telemetry layer. CrashLab never queries, connects to, or accesses MongoDB directly.
- **Dedicated Staging Environment:** Contains fake data only. No customer data, real payments, real orders, SMS, or emails.
- **Backend Architecture:** Node.js, Express, and MongoDB (via official `mongodb` driver).
- **Authentication:** Server-side hashed password and signed HttpOnly cookies.

## Endpoints

- `GET /health`: Health check returning `{ status: "ok", environment: "staging", database: "mongodb", fixture: "crashlab-mongodb-pilot" }`
- `GET /readiness`: MongoDB ping verifying live connection.
- `GET /login` & `POST /api/auth/login`: Staging authentication.
- `GET /` & `GET /dashboard`: Protected dashboard with event counts.
- `GET /events`: Seeded events listing.
- `GET /events/:id`: Event details.
- `GET /api/staging/defect-probe`: Staging-only controlled defect returning HTTP 500 (`CONTROLLED_MONGODB_PILOT_DEFECT`).

## Commands

```bash
npm install     # Install dependencies
npm run seed    # Seed fake test user and events idempotently
npm run dev     # Start local development server
npm run test    # Run 17-part automated fixture test suite
npm run build   # Compile TypeScript to dist/
npm start       # Start production server
```
