import { MongoClient, type Db, type Collection } from 'mongodb';
import type { StagingUser, StagingEvent } from './types.js';

let client: MongoClient | null = null;
let db: Db | null = null;
let memoryServerInstance: any = null;

export interface DbCollections {
  users: Collection<StagingUser>;
  events: Collection<StagingEvent>;
  testMetadata: Collection<{ key: string; value: any; updatedAt: string }>;
}

let lastError: string | null = null;

export async function connectToDatabase(customUri?: string): Promise<{ db: Db; uri: string }> {
  if (db && client) {
    return { db, uri: 'mongodb://connected' };
  }

  let uri = customUri || process.env.MONGODB_URI;

  if (!uri || uri === 'memory') {
    // Lazily boot in-memory MongoDB for local tests / development
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServerInstance = await MongoMemoryServer.create();
    uri = memoryServerInstance.getUri();
  }

  const mongoUri: string = uri!;

  const clientOptions: any = {
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
  };

  // Preserve authSource=admin for hosted MongoDB / Atlas replica sets if not in URI
  if (!mongoUri.includes('authSource=') && !memoryServerInstance) {
    clientOptions.authSource = 'admin';
  }

  try {
    const newClient = new MongoClient(mongoUri, clientOptions);
    await newClient.connect();
    const newDb = newClient.db('crashlab_pilot_staging');

    // Ensure unique index on user email
    await newDb.collection<StagingUser>('users').createIndex({ email: 1 }, { unique: true });
    await newDb.collection<StagingEvent>('events').createIndex({ id: 1 }, { unique: true });

    client = newClient;
    db = newDb;
    lastError = null;
    return { db, uri: 'mongodb://connected' };
  } catch (err: any) {
    const sanitizedMsg = (err?.message || 'Connection failed')
      .replace(/mongodb(\+srv)?:\/\/[^\s@]+@/gi, 'mongodb+srv://[REDACTED]@')
      .replace(/:[^:@/\s]+@/g, ':[REDACTED]@');
    lastError = sanitizedMsg;
    throw new Error(sanitizedMsg);
  }
}

export function getClient(): MongoClient {
  if (!client) {
    throw new Error('Database client not initialized. Call connectToDatabase() first.');
  }
  return client;
}

export function getDatabase(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectToDatabase() first.');
  }
  return db;
}

export function getCollections(): DbCollections {
  const database = getDatabase();
  return {
    users: database.collection<StagingUser>('users'),
    events: database.collection<StagingEvent>('events'),
    testMetadata: database.collection<{ key: string; value: any; updatedAt: string }>('test_metadata'),
  };
}

export interface DatabaseBoundaryResult {
  status: 'ok' | 'violation';
  stagingDatabase: string;
  canReadStaging: boolean;
  canWriteStaging: boolean;
  canIndexStaging: boolean;
  crossDatabaseDenied: boolean;
  crossDatabaseMessage: string;
  isMemoryServer?: boolean;
}

export async function verifyDatabaseBoundaries(): Promise<DatabaseBoundaryResult> {
  const currentDb = getDatabase();
  const currentClient = getClient();

  // 1. Verify read on staging database
  const userCount = await currentDb.collection('users').countDocuments();
  const canReadStaging = typeof userCount === 'number';

  // 2. Verify write on staging database (idempotent probe write and cleanup)
  const probeKey = `boundary_probe_${Date.now()}`;
  await currentDb.collection('test_metadata').insertOne({
    key: probeKey,
    value: 'least_privilege_verification',
    updatedAt: new Date().toISOString(),
  });
  await currentDb.collection('test_metadata').deleteOne({ key: probeKey });
  const canWriteStaging = true;

  // 3. Verify index creation/presence on staging database
  const userIndexes = await currentDb.collection('users').indexes();
  const canIndexStaging = userIndexes.some((idx) => idx.name === 'email_1' || (idx.key as any)?.email === 1);

  // 4. Safe non-destructive cross-database access probe
  let crossDatabaseDenied = false;
  let crossDatabaseMessage = '';

  if (memoryServerInstance) {
    // In local unit/test mode with MongoMemoryServer, access control is simulated
    crossDatabaseDenied = true;
    crossDatabaseMessage = 'Simulated boundary enforcement for in-memory MongoDB server';
    return {
      status: 'ok',
      stagingDatabase: 'crashlab_pilot_staging',
      canReadStaging,
      canWriteStaging,
      canIndexStaging,
      crossDatabaseDenied,
      crossDatabaseMessage,
      isMemoryServer: true,
    };
  }

  try {
    // Non-destructive read attempt on unrelated database
    await currentClient
      .db('unrelated_prod_db')
      .collection('unrelated_probe')
      .findOne({});
    // If no error thrown, user still has broader permissions (e.g. readWriteAnyDatabase)
    crossDatabaseDenied = false;
    crossDatabaseMessage = 'UNRESTRICTED: Foreign database read succeeded without authorization rejection';
  } catch (err: any) {
    // User correctly restricted to only crashlab_pilot_staging database:
    // MongoServerError: not authorized on unrelated_prod_db to execute command: { find: ... } (code 13)
    crossDatabaseDenied = true;
    crossDatabaseMessage = err?.message || 'Access denied on foreign database';
  }

  return {
    status: canReadStaging && canWriteStaging && canIndexStaging && crossDatabaseDenied ? 'ok' : 'violation',
    stagingDatabase: 'crashlab_pilot_staging',
    canReadStaging,
    canWriteStaging,
    canIndexStaging,
    crossDatabaseDenied,
    crossDatabaseMessage,
    isMemoryServer: false,
  };
}

export async function checkReadiness(): Promise<{ ready: boolean; error?: string }> {
  try {
    if (!client || !db) {
      try {
        await connectToDatabase();
      } catch {
        return { ready: false, error: lastError || 'Database client not initialized.' };
      }
    }
    if (!client || !db) {
      return { ready: false, error: lastError || 'Database client not initialized.' };
    }
    await db.command({ ping: 1 });
    return { ready: true };
  } catch (err: any) {
    return { ready: false, error: lastError || 'Database ping failed.' };
  }
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
    memoryServerInstance = null;
  }
}
