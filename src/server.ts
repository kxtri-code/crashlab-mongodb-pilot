import { connectToDatabase, closeDatabase } from './db.js';
import { seedDatabase, SEEDED_USER_EMAIL } from './seed.js';
import { createApp } from './app.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  const app = createApp();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FIXTURE READY] CrashLab MongoDB Pilot Fixture listening on http://0.0.0.0:${PORT}`);
    console.log(`[FIXTURE READY] Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`[FIXTURE READY] Readiness check: http://0.0.0.0:${PORT}/readiness`);
  });

  try {
    console.log('[FIXTURE STARTUP] Connecting to MongoDB...');
    await connectToDatabase();
    console.log('[FIXTURE STARTUP] MongoDB connected successfully.');

    console.log('[FIXTURE STARTUP] Seeding staging data...');
    const seedResult = await seedDatabase();
    console.log(`[FIXTURE STARTUP] Data seeded: ${seedResult.eventsCount} events, dedicated user: ${SEEDED_USER_EMAIL}`);
  } catch (err: any) {
    console.error('[FIXTURE STARTUP WARNING] Database connection error during startup:', err.message);
  }

  const shutdown = async (signal: string) => {
    console.log(`[FIXTURE SHUTDOWN] Received ${signal}. Closing HTTP server and database connection...`);
    server.close(async () => {
      await closeDatabase();
      console.log('[FIXTURE SHUTDOWN] Clean shutdown complete.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[FIXTURE FATAL] Startup failed:', err.message);
  process.exit(1);
});
