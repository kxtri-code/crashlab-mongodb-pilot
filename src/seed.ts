import { connectToDatabase, getCollections, closeDatabase } from './db.js';
import { hashPassword } from './auth.js';
import type { StagingUser, StagingEvent } from './types.js';

export const SEEDED_USER_EMAIL = 'qa-pilot@example.test';
export const SEEDED_USER_PASSWORD = 'PilotPassword2026!'; // Server-side test account password, never printed in logs

export const SEEDED_EVENTS: StagingEvent[] = [
  {
    id: 'evt_tech_summit_2026',
    title: 'Staging Tech Summit 2026',
    description: 'Annual gathering of staging infrastructure engineers and black-box testing operators.',
    date: '2026-11-15T09:00:00Z',
    venue: 'Virtual Hall A (Staging)',
    status: 'open',
    totalAvailableTickets: 150,
    ticketCategories: [
      { id: 'cat_gen', name: 'General Admission', price: 0, currency: 'USD', availableCount: 100, isFake: true },
      { id: 'cat_vip', name: 'VIP Pass (Virtual)', price: 0, currency: 'USD', availableCount: 50, isFake: true },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'evt_qa_workshop',
    title: 'Cloud QA Workshop',
    description: 'Hands-on synthetic verification and failure injection workshop in isolated environments.',
    date: '2026-12-01T14:00:00Z',
    venue: 'Sandbox Stage 2 (Staging)',
    status: 'open',
    totalAvailableTickets: 75,
    ticketCategories: [
      { id: 'cat_wksp', name: 'Standard Workshop Seat', price: 0, currency: 'USD', availableCount: 75, isFake: true },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'evt_synthetic_showcase',
    title: 'Synthetic Pilot Showcase',
    description: 'Demonstration of automated browser journey test execution and bounded defect reproduction.',
    date: '2026-12-12T10:00:00Z',
    venue: 'Test Arena (Staging)',
    status: 'open',
    totalAvailableTickets: 200,
    ticketCategories: [
      { id: 'cat_observer', name: 'Observer Pass', price: 0, currency: 'USD', availableCount: 200, isFake: true },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export async function seedDatabase(): Promise<{ userSeeded: boolean; eventsCount: number }> {
  const collections = getCollections();
  const now = new Date().toISOString();

  // 1. Idempotently seed or update test user
  const { hash, salt } = hashPassword(SEEDED_USER_PASSWORD);
  await collections.users.updateOne(
    { email: SEEDED_USER_EMAIL },
    {
      $set: {
        id: 'usr_qa_pilot_seed_01',
        email: SEEDED_USER_EMAIL,
        passwordHash: hash,
        salt,
        role: 'qa_pilot',
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  // 2. Idempotently seed events
  for (const event of SEEDED_EVENTS) {
    await collections.events.updateOne(
      { id: event.id },
      {
        $set: {
          title: event.title,
          description: event.description,
          date: event.date,
          venue: event.venue,
          status: event.status,
          ticketCategories: event.ticketCategories,
          totalAvailableTickets: event.totalAvailableTickets,
          updatedAt: now,
        },
        $setOnInsert: {
          id: event.id,
          createdAt: now,
        },
      },
      { upsert: true }
    );
  }

  // 3. Update metadata
  await collections.testMetadata.updateOne(
    { key: 'seed_status' },
    {
      $set: {
        key: 'seed_status',
        value: {
          version: '1.0',
          environment: 'staging',
          seededAt: now,
          eventsCount: SEEDED_EVENTS.length,
        },
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  return {
    userSeeded: true,
    eventsCount: SEEDED_EVENTS.length,
  };
}

// Standalone CLI execution
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  connectToDatabase()
    .then(async () => {
      const res = await seedDatabase();
      console.log(`[SEED SUCCESS] Idempotently seeded test user (${SEEDED_USER_EMAIL}) and ${res.eventsCount} events.`);
      await closeDatabase();
    })
    .catch((err) => {
      console.error('[SEED ERROR] Failed to seed database:', err);
      process.exit(1);
    });
}
