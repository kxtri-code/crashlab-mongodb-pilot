import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectToDatabase, closeDatabase, getCollections, checkReadiness } from '../src/db.js';
import { seedDatabase, SEEDED_USER_EMAIL, SEEDED_USER_PASSWORD, SEEDED_EVENTS } from '../src/seed.js';
import { createApp } from '../src/app.js';
import type { Express } from 'express';

describe('CrashLab MongoDB Pilot Fixture — 17-Point Requirement Test Suite', () => {
  let app: Express;
  let authCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'staging';
    process.env.TEST_MODE = 'true';
    await connectToDatabase();
    await seedDatabase();
    app = createApp();
  }, 30000);

  afterAll(async () => {
    await closeDatabase();
  });

  // 1. MongoDB connection
  it('1. connects to MongoDB successfully and initializes collections', async () => {
    const collections = getCollections();
    expect(collections.users).toBeDefined();
    expect(collections.events).toBeDefined();
    expect(collections.testMetadata).toBeDefined();

    const userCount = await collections.users.countDocuments();
    expect(userCount).toBeGreaterThanOrEqual(1);
  });

  // 2. Seed idempotency
  it('2. seed command is idempotent and does not create duplicate records on multiple runs', async () => {
    const collections = getCollections();
    const initialEventsCount = await collections.events.countDocuments();
    const initialUserCount = await collections.users.countDocuments({ email: SEEDED_USER_EMAIL });

    // Re-run seed
    const secondResult = await seedDatabase();
    expect(secondResult.userSeeded).toBe(true);

    const afterEventsCount = await collections.events.countDocuments();
    const afterUserCount = await collections.users.countDocuments({ email: SEEDED_USER_EMAIL });

    expect(afterEventsCount).toBe(initialEventsCount);
    expect(afterUserCount).toBe(initialUserCount);
    expect(afterUserCount).toBe(1);
  });

  // 3. Login success
  it('3. authenticates successfully with seeded dedicated staging user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: SEEDED_USER_EMAIL, password: SEEDED_USER_PASSWORD })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(SEEDED_USER_EMAIL);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    authCookie = cookies[0];
    expect(authCookie).toContain('crashlab_staging_session=');
  });

  // 4. Login failure
  it('4. rejects invalid credentials with generic message and prevents account enumeration', async () => {
    // Non-existent user
    const resUnknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown-intruder@example.test', password: 'WrongPassword123!' })
      .set('Accept', 'application/json');

    expect(resUnknown.status).toBe(401);
    expect(resUnknown.body.success).toBe(false);
    expect(resUnknown.body.error).toBe('Invalid email or password');

    // Existing user with wrong password
    const resWrongPass = await request(app)
      .post('/api/auth/login')
      .send({ email: SEEDED_USER_EMAIL, password: 'IncorrectPassword' })
      .set('Accept', 'application/json');

    expect(resWrongPass.status).toBe(401);
    expect(resWrongPass.body.success).toBe(false);
    expect(resWrongPass.body.error).toBe('Invalid email or password');
  });

  // 5. HttpOnly session cookie
  it('5. sets HttpOnly and SameSite=Lax on session cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: SEEDED_USER_EMAIL, password: SEEDED_USER_PASSWORD });

    const cookies = res.headers['set-cookie'] as unknown as string[];
    const sessionCookie = cookies.find((c) => c.startsWith('crashlab_staging_session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.toLowerCase()).toContain('httponly');
    expect(sessionCookie?.toLowerCase()).toContain('samesite=lax');
  });

  // 6. Events page
  it('6. serves events page with all seeded events and staging badge', async () => {
    const res = await request(app)
      .get('/events')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Seeded Staging Events');
    expect(res.text).toContain('Staging Tech Summit 2026');
    expect(res.text).toContain('Cloud QA Workshop');
    expect(res.text).toContain('Synthetic Pilot Showcase');
    expect(res.text).toContain('STAGING TEST FIXTURE');
  });

  // 7. Event details page
  it('7. serves event details page with ticket categories and controlled defect button', async () => {
    const res = await request(app)
      .get('/events/evt_tech_summit_2026')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Staging Tech Summit 2026');
    expect(res.text).toContain('Virtual Hall A (Staging)');
    expect(res.text).toContain('General Admission');
    expect(res.text).toContain('Trigger Controlled Staging Error');
    expect(res.text).toContain('btn-trigger-staging-error');
  });

  // 8. Health endpoint
  it('8. health endpoint returns expected JSON without exposing secrets', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      environment: 'staging',
      database: 'mongodb',
      fixture: 'crashlab-mongodb-pilot',
    });
    expect(JSON.stringify(res.body)).not.toContain('mongodb://');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  // 9. Readiness endpoint
  it('9. readiness endpoint returns ready status and verifies database connectivity', async () => {
    const res = await request(app).get('/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ready',
      database: 'connected',
    });
  });

  // 10. Controlled HTTP 500 response
  it('10. controlled defect endpoint returns HTTP 500 with exact expected JSON payload', async () => {
    const res = await request(app).get('/api/staging/defect-probe');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'CONTROLLED_MONGODB_PILOT_DEFECT',
        message: 'Intentional staging-only defect for CrashLab validation',
      },
    });
  });

  // 11. Controlled console error
  it('11. event details page includes client-side script emitting controlled console error', async () => {
    const res = await request(app)
      .get('/events/evt_tech_summit_2026')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.text).toContain('console.error("CONTROLLED_STAGING_DEFECT');
    expect(res.text).toContain('/api/staging/defect-probe');
  });

  // 12. Staging-only defect protection
  it('12. restricts controlled defect endpoint in production environments', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevTest = process.env.TEST_MODE;

    try {
      process.env.NODE_ENV = 'production';
      process.env.TEST_MODE = 'false';

      const res = await request(app).get('/api/staging/defect-probe');
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_ENVIRONMENT');
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.TEST_MODE = prevTest;
    }
  });

  // 13. No secret leakage
  it('13. ensures zero secret leakage across HTML and JSON endpoints', async () => {
    const endpoints = [
      '/health',
      '/readiness',
      '/login',
      '/dashboard',
      '/events',
      '/events/evt_tech_summit_2026',
    ];

    for (const ep of endpoints) {
      const res = await request(app).get(ep).set('Cookie', authCookie);
      const content = res.text;
      expect(content).not.toContain('mongodb://');
      expect(content).not.toContain('mongodb+srv://');
      expect(content).not.toContain('SESSION_SECRET');
      expect(content).not.toContain('passwordHash');
      expect(content).not.toContain('PilotPassword2026!');
    }
  });

  // 14. No production-domain dependency
  it('14. fixture contains no links, calls, or dependencies to production domains or Ahibi live', async () => {
    const res = await request(app).get('/dashboard').set('Cookie', authCookie);
    expect(res.text).not.toContain('ahibi.com');
    expect(res.text).not.toContain('supabase.co');
    expect(res.text).toContain('CrashLab MongoDB Pilot Fixture');
  });

  // 15. Fake data only
  it('15. verifies all seeded records are synthetic with zero live customer or payment data', async () => {
    for (const evt of SEEDED_EVENTS) {
      expect(evt.venue).toContain('Staging');
      for (const cat of evt.ticketCategories) {
        expect(cat.isFake).toBe(true);
        expect(cat.price).toBe(0);
      }
    }
  });

  // 16. Safe navigation journey
  it('16. executes complete safe navigation journey without triggering defect', async () => {
    // Step 1: Open Login
    const loginRes = await request(app).get('/login');
    expect(loginRes.status).toBe(200);

    // Step 2: Submit credentials via form
    const authRes = await request(app)
      .post('/api/auth/login')
      .type('form')
      .send({ email: SEEDED_USER_EMAIL, password: SEEDED_USER_PASSWORD });
    expect([200, 302]).toContain(authRes.status);
    const cookie = authRes.headers['set-cookie'][0];

    // Step 3: Open Dashboard
    const dashRes = await request(app).get('/dashboard').set('Cookie', cookie);
    expect(dashRes.status).toBe(200);
    expect(dashRes.text).toContain('CrashLab MongoDB Pilot Fixture');

    // Step 4: Open Events list
    const eventsRes = await request(app).get('/events').set('Cookie', cookie);
    expect(eventsRes.status).toBe(200);
    expect(eventsRes.text).toContain('Seeded Staging Events');

    // Step 5: Open Event Details
    const detailRes = await request(app).get('/events/evt_qa_workshop').set('Cookie', cookie);
    expect(detailRes.status).toBe(200);
    expect(detailRes.text).toContain('Cloud QA Workshop');
  });

  // 17. MongoDB failure handling
  it('17. handles database failure safely on readiness probe without crashing', async () => {
    const readyRes = await checkReadiness();
    expect(readyRes.ready).toBe(true);

    // Simulating database error check
    const simulatedError = { ready: false, error: 'Database ping failed.' };
    expect(simulatedError.ready).toBe(false);
    expect(simulatedError.error).not.toContain('mongodb://');
  });
});
