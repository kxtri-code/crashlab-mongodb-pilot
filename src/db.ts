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

  client = new MongoClient(mongoUri, {
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  db = client.db('crashlab_pilot_staging');

  // Ensure unique index on user email
  await db.collection<StagingUser>('users').createIndex({ email: 1 }, { unique: true });
  await db.collection<StagingEvent>('events').createIndex({ id: 1 }, { unique: true });

  return { db, uri: 'mongodb://connected' };
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

export async function checkReadiness(): Promise<{ ready: boolean; error?: string }> {
  try {
    if (!client || !db) {
      return { ready: false, error: 'Database client not initialized.' };
    }
    await db.command({ ping: 1 });
    return { ready: true };
  } catch (err: any) {
    // Return safe failure message without exposing connection strings or internal credentials
    return { ready: false, error: 'Database ping failed.' };
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
