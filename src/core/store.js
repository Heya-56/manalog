// Persistence: single-table design. DynamoDB on AWS, in-memory Map locally/tests.
// pk = "T#<tenant>#U#<user>"  sk = "MISSION#<id>" | "WATCH#<slug>" | "PREF" | "USAGE#<yyyymm>"
import { config } from './config.js';

class MemoryStore {
  constructor() { this.m = new Map(); }
  k(pk, sk) { return `${pk}|${sk}`; }
  async get(pk, sk) { return structuredClone(this.m.get(this.k(pk, sk)) ?? null); }
  async put(pk, sk, item) { this.m.set(this.k(pk, sk), structuredClone({ ...item, pk, sk })); return item; }
  async del(pk, sk) { this.m.delete(this.k(pk, sk)); }
  async query(pk, prefix = '') {
    return [...this.m.values()].filter((v) => v.pk === pk && v.sk.startsWith(prefix)).map((v) => structuredClone(v));
  }
  async incr(pk, sk, field, by = 1) {
    const cur = (await this.get(pk, sk)) ?? {};
    cur[field] = (cur[field] ?? 0) + by;
    await this.put(pk, sk, cur);
    return cur[field];
  }
}

class DynamoStore {
  constructor(table) {
    this.table = table;
    this.ready = (async () => {
      const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
      const lib = await import('@aws-sdk/lib-dynamodb');
      this.lib = lib;
      this.doc = lib.DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }), { marshallOptions: { removeUndefinedValues: true } });
    })();
  }
  async get(pk, sk) { await this.ready; return (await this.doc.send(new this.lib.GetCommand({ TableName: this.table, Key: { pk, sk } }))).Item ?? null; }
  async put(pk, sk, item) { await this.ready; await this.doc.send(new this.lib.PutCommand({ TableName: this.table, Item: { ...item, pk, sk } })); return item; }
  async del(pk, sk) { await this.ready; await this.doc.send(new this.lib.DeleteCommand({ TableName: this.table, Key: { pk, sk } })); }
  async query(pk, prefix = '') {
    await this.ready;
    const r = await this.doc.send(new this.lib.QueryCommand({
      TableName: this.table, KeyConditionExpression: 'pk = :pk AND begins_with(sk, :p)',
      ExpressionAttributeValues: { ':pk': pk, ':p': prefix },
    }));
    return r.Items ?? [];
  }
  async incr(pk, sk, field, by = 1) {
    await this.ready;
    const r = await this.doc.send(new this.lib.UpdateCommand({
      TableName: this.table, Key: { pk, sk }, UpdateExpression: 'ADD #f :b',
      ExpressionAttributeNames: { '#f': field }, ExpressionAttributeValues: { ':b': by }, ReturnValues: 'UPDATED_NEW',
    }));
    return r.Attributes?.[field] ?? by;
  }
}

let instance;
export function store() {
  if (!instance) instance = config.storage === 'dynamodb' ? new DynamoStore(config.table) : new MemoryStore();
  return instance;
}
export function _resetStoreForTests() { instance = new MemoryStore(); }

export const userPk = (ctx) => `T#${ctx.tenant.id}#U#${ctx.userId}`;
