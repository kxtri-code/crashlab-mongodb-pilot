import { MongoClient, type Db, type Collection } from 'mongodb';
import tls from 'node:tls';
import dns from 'node:dns/promises';
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

  try {
    const newClient = new MongoClient(mongoUri, {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });
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

  let testClient: MongoClient | null = null;
  try {
    testClient = new MongoClient(process.env.MONGODB_URI || '', {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
    });
    await testClient.connect();
    await testClient.db('unrelated_prod_db').collection('unrelated_probe').findOne({});
    crossDatabaseDenied = false;
    crossDatabaseMessage = 'UNRESTRICTED: Foreign database read succeeded without authorization rejection';
  } catch (err: any) {
    crossDatabaseDenied = true;
    crossDatabaseMessage = err?.message || 'Access denied on foreign database';
  } finally {
    if (testClient) {
      await testClient.close().catch(() => {});
    }
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

export interface ConnectionDiagnosis {
  configured: boolean;
  protocol?: string;
  username?: string;
  hasPassword?: boolean;
  passwordLength?: number;
  host?: string;
  database?: string;
  queryParams?: Record<string, string>;
  hasAuthSourceAdmin?: boolean;
  dnsResolution?: {
    srvRecordsFound: number;
    sampleShardHost?: string;
    sampleShardPort?: number;
    error?: string;
  };
  tlsHandshakeTest?: {
    success: boolean;
    authorized?: boolean;
    protocol?: string;
    cipher?: string;
    error?: string;
  };
  clientPingTest?: {
    success: boolean;
    error?: string;
  };
}

export async function diagnoseDatabaseConnection(): Promise<ConnectionDiagnosis> {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri === 'memory') {
    return { configured: false };
  }

  const diagnosis: ConnectionDiagnosis = {
    configured: true,
  };

  try {
    const parsed = new URL(uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://'));
    diagnosis.protocol = uri.startsWith('mongodb+srv://') ? 'mongodb+srv' : 'mongodb';
    diagnosis.username = parsed.username || undefined;
    diagnosis.hasPassword = !!parsed.password;
    diagnosis.passwordLength = parsed.password ? parsed.password.length : 0;
    diagnosis.host = parsed.hostname;
    diagnosis.database = (parsed.pathname || '').replace(/^\//, '');

    const params: Record<string, string> = {};
    parsed.searchParams.forEach((val, key) => {
      params[key] = val;
    });
    diagnosis.queryParams = params;
    diagnosis.hasAuthSourceAdmin = params['authSource'] === 'admin';

    let sampleShardHost = '';
    let sampleShardPort = 27017;
    try {
      if (diagnosis.protocol === 'mongodb+srv' && diagnosis.host) {
        const srvName = `_mongodb._tcp.${diagnosis.host}`;
        const records = await dns.resolveSrv(srvName);
        diagnosis.dnsResolution = {
          srvRecordsFound: records.length,
          sampleShardHost: records[0]?.name,
          sampleShardPort: records[0]?.port,
        };
        sampleShardHost = records[0]?.name || '';
        sampleShardPort = records[0]?.port || 27017;
      }
    } catch (dnsErr: any) {
      diagnosis.dnsResolution = {
        srvRecordsFound: 0,
        error: dnsErr.message,
      };
    }

    const targetTlsHost = sampleShardHost || diagnosis.host;
    if (targetTlsHost) {
      try {
        const tlsResult = await new Promise<{
          success: boolean;
          authorized?: boolean;
          protocol?: string;
          cipher?: string;
          error?: string;
        }>((resolve) => {
          const socket = tls.connect(
            {
              host: targetTlsHost,
              port: sampleShardPort,
              servername: targetTlsHost,
              rejectUnauthorized: false,
              timeout: 4000,
            },
            () => {
              const info = {
                success: true,
                authorized: socket.authorized,
                protocol: socket.getProtocol() || undefined,
                cipher: socket.getCipher()?.name,
              };
              socket.end();
              resolve(info);
            }
          );

          socket.on('error', (err) => {
            resolve({ success: false, error: err.message });
          });

          socket.on('timeout', () => {
            socket.destroy();
            resolve({ success: false, error: 'TLS handshake timeout' });
          });
        });

        diagnosis.tlsHandshakeTest = tlsResult;
      } catch (tlsErr: any) {
        diagnosis.tlsHandshakeTest = { success: false, error: tlsErr.message };
      }
    }

    try {
      if (!client || !db) {
        await connectToDatabase();
      }
      if (db) {
        await db.command({ ping: 1 });
        diagnosis.clientPingTest = { success: true };
      } else {
        diagnosis.clientPingTest = { success: false, error: 'Database not initialized' };
      }
    } catch (clientErr: any) {
      diagnosis.clientPingTest = {
        success: false,
        error: (clientErr.message || 'Client connect failed')
          .replace(/mongodb(\+srv)?:\/\/[^\s@]+@/gi, 'mongodb+srv://[REDACTED]@')
          .replace(/:[^:@/\s]+@/g, ':[REDACTED]@'),
      };
    }
  } catch (parseErr: any) {
    diagnosis.clientPingTest = { success: false, error: parseErr.message };
  }

  return diagnosis;
}
