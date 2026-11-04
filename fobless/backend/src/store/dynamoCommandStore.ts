import type { CommandRecord } from "../domain.js";
import type { CommandStore } from "./commandStore.js";

/**
 * DynamoDB single-table store.
 *
 *   pk = CMD#<id>            sk = CMD    -> the command record (audit trail)
 *   pk = IDEM#<user>#<key>   sk = IDEM   -> idempotency claim, pointing at the command id
 *   GSI byVin:  gsi1pk = VIN#<vin>,   gsi1sk = createdAt   -> history screen
 *   GSI byUser: gsi2pk = USER#<sub>,  gsi2sk = createdAt   -> per-user rate limiting
 *
 * Both items carry `expiresAt` (epoch seconds) so DynamoDB TTL ages the audit log out.
 *
 * The AWS SDK v3 ships inside the Lambda Node.js runtime, so it is loaded at runtime rather
 * than bundled. Items are flat strings/numbers, so we marshal them by hand.
 */
type Attr = { S: string } | { N: string } | { NULL: true };
type Item = Record<string, Attr>;

const SDK = "@aws-sdk/client-dynamodb";
const RETENTION_DAYS = 90;

const toAttr = (v: unknown): Attr =>
  v === null || v === undefined ? { NULL: true } : typeof v === "number" ? { N: String(v) } : { S: String(v) };

function fromItem(item: Item): CommandRecord {
  const out: Record<string, unknown> = {};
  for (const [k, a] of Object.entries(item)) out[k] = "S" in a ? a.S : "N" in a ? Number(a.N) : null;
  const { pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, expiresAt, ...rec } = out;
  return rec as unknown as CommandRecord;
}

export class DynamoCommandStore implements CommandStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sdk: Promise<{ client: any; mod: any }> | undefined;

  constructor(private readonly tableName: string) {}

  private load() {
    this.sdk ??= import(SDK as string).then((mod) => ({ mod, client: new mod.DynamoDBClient({}) }));
    return this.sdk;
  }

  private async send(command: string, input: object) {
    const { client, mod } = await this.load();
    return client.send(new mod[command](input));
  }

  async createOrGet(record: CommandRecord) {
    const expiresAt = Math.floor(Date.parse(record.createdAt) / 1000) + RETENTION_DAYS * 86_400;
    const idemPk = `IDEM#${record.userId}#${record.idempotencyKey}`;
    const commandItem: Item = Object.fromEntries(
      Object.entries({
        ...record,
        pk: `CMD#${record.id}`,
        sk: "CMD",
        gsi1pk: `VIN#${record.vin}`,
        gsi1sk: record.createdAt,
        gsi2pk: `USER#${record.userId}`,
        gsi2sk: record.createdAt,
        expiresAt,
      }).map(([k, v]) => [k, toAttr(v)]),
    );
    try {
      await this.send("TransactWriteItemsCommand", {
        TransactItems: [
          {
            Put: {
              TableName: this.tableName,
              Item: { pk: { S: idemPk }, sk: { S: "IDEM" }, commandId: { S: record.id }, expiresAt: { N: String(expiresAt) } },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
          { Put: { TableName: this.tableName, Item: commandItem } },
        ],
      });
      return { record, created: true };
    } catch (err) {
      if ((err as { name?: string }).name !== "TransactionCanceledException") throw err;
      const claim = await this.send("GetItemCommand", {
        TableName: this.tableName,
        Key: { pk: { S: idemPk }, sk: { S: "IDEM" } },
        ConsistentRead: true,
      });
      const existing = claim.Item ? await this.get(claim.Item.commandId.S) : null;
      if (!existing) throw err;
      return { record: existing, created: false };
    }
  }

  async update(id: string, patch: Partial<CommandRecord>) {
    const entries = Object.entries(patch);
    const res = await this.send("UpdateItemCommand", {
      TableName: this.tableName,
      Key: { pk: { S: `CMD#${id}` }, sk: { S: "CMD" } },
      UpdateExpression: "SET " + entries.map((_, i) => `#k${i} = :v${i}`).join(", "),
      ExpressionAttributeNames: Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k])),
      ExpressionAttributeValues: Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, toAttr(v)])),
      ConditionExpression: "attribute_exists(pk)",
      ReturnValues: "ALL_NEW",
    });
    return fromItem(res.Attributes);
  }

  async get(id: string) {
    const res = await this.send("GetItemCommand", {
      TableName: this.tableName,
      Key: { pk: { S: `CMD#${id}` }, sk: { S: "CMD" } },
      ConsistentRead: true,
    });
    return res.Item ? fromItem(res.Item) : null;
  }

  async listByVin(vin: string, limit: number) {
    const res = await this.send("QueryCommand", {
      TableName: this.tableName,
      IndexName: "byVin",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: { ":pk": { S: `VIN#${vin}` } },
      ScanIndexForward: false,
      Limit: limit,
    });
    return (res.Items ?? []).map(fromItem);
  }

  async countByUserSince(userId: string, sinceIso: string) {
    const res = await this.send("QueryCommand", {
      TableName: this.tableName,
      IndexName: "byUser",
      KeyConditionExpression: "gsi2pk = :pk AND gsi2sk >= :since",
      ExpressionAttributeValues: { ":pk": { S: `USER#${userId}` }, ":since": { S: sinceIso } },
      Select: "COUNT",
    });
    return res.Count ?? 0;
  }
}
