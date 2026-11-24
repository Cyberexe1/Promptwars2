import { createHash, randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * User accounts.
 *
 * Records are keyed by a SHA-256 of the normalised email rather than the email
 * itself, so a key listing does not expose anyone's address. The email is kept
 * in the item because the interface shows who is signed in.
 *
 * Nothing about a household, its health answers, or its plans is stored here.
 * Accounts exist only to identify a returning user; plans stay on the device.
 */

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface UserStore {
  findByEmail(email: string): Promise<UserRecord | null>;
  /** Returns null when the email is already taken. */
  create(email: string, passwordHash: string): Promise<UserRecord | null>;
  readonly kind: 'dynamodb' | 'memory';
}

/** Lowercase and trim, so one address cannot register twice. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function userKey(email: string): string {
  const digest = createHash('sha256').update(normaliseEmail(email)).digest('hex');
  return `USER#${digest}`;
}

function newUser(email: string, passwordHash: string): UserRecord {
  return {
    id: randomUUID(),
    email: normaliseEmail(email),
    passwordHash,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Process-local store for development.
 *
 * Accounts vanish when the server restarts, which is acceptable for local work
 * and never acceptable in production, so construction logs a warning.
 */
export class MemoryUserStore implements UserStore {
  readonly kind = 'memory' as const;

  private readonly byKey = new Map<string, UserRecord>();

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.byKey.get(userKey(email)) ?? null;
  }

  async create(email: string, passwordHash: string): Promise<UserRecord | null> {
    const key = userKey(email);
    if (this.byKey.has(key)) {
      return null;
    }
    const user = newUser(email, passwordHash);
    this.byKey.set(key, user);
    return user;
  }
}

export class DynamoDbUserStore implements UserStore {
  readonly kind = 'dynamodb' as const;

  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: userKey(email), sk: 'PROFILE' },
        // Reading a password hash must never serve a stale value from a
        // replica, or a changed password could still accept the old one.
        ConsistentRead: true,
      }),
    );

    const item = result.Item;
    if (!item) {
      return null;
    }

    return {
      id: String(item.userId),
      email: String(item.email),
      passwordHash: String(item.passwordHash),
      createdAt: String(item.createdAt),
    };
  }

  async create(email: string, passwordHash: string): Promise<UserRecord | null> {
    const user = newUser(email, passwordHash);

    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            pk: userKey(email),
            sk: 'PROFILE',
            userId: user.id,
            email: user.email,
            passwordHash: user.passwordHash,
            createdAt: user.createdAt,
          },
          // Rejects a second write for the same email. Checking first and then
          // writing would leave a race between two concurrent signups.
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
      return user;
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'ConditionalCheckFailedException'
      ) {
        return null;
      }
      throw error;
    }
  }
}

let store: UserStore | undefined;

export function getUserStore(): UserStore {
  if (!store) {
    if (config.dynamoDbTableName) {
      store = new DynamoDbUserStore(
        DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.awsRegion }), {
          marshallOptions: { removeUndefinedValues: true },
        }),
        config.dynamoDbTableName,
      );
    } else {
      store = new MemoryUserStore();
      logger.warn('user_store_in_memory', {
        detail: 'Accounts will be lost on restart. Set DYNAMODB_TABLE_NAME.',
      });
    }
    logger.info('user_store_initialised', { kind: store.kind });
  }
  return store;
}

/** Test seam, so the suite never reaches AWS. */
export function setUserStoreForTesting(next: UserStore | undefined): void {
  store = next;
}
