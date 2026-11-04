import type { CommandRecord } from "../domain.js";

export interface CommandStore {
  /**
   * Atomically claim an idempotency key and persist the command.
   * Returns the existing record instead if the key was already used by this user.
   */
  createOrGet(record: CommandRecord): Promise<{ record: CommandRecord; created: boolean }>;
  update(id: string, patch: Partial<Pick<CommandRecord, "status" | "completedAt" | "error">>): Promise<CommandRecord>;
  get(id: string): Promise<CommandRecord | null>;
  listByVin(vin: string, limit: number): Promise<CommandRecord[]>;
  countByUserSince(userId: string, sinceIso: string): Promise<number>;
}

export class InMemoryCommandStore implements CommandStore {
  private readonly byId = new Map<string, CommandRecord>();
  private readonly byIdem = new Map<string, string>();

  async createOrGet(record: CommandRecord) {
    const key = `${record.userId}#${record.idempotencyKey}`;
    const existingId = this.byIdem.get(key);
    if (existingId) return { record: { ...this.byId.get(existingId)! }, created: false };
    this.byIdem.set(key, record.id);
    this.byId.set(record.id, { ...record });
    return { record: { ...record }, created: true };
  }

  async update(id: string, patch: Partial<CommandRecord>) {
    const rec = this.byId.get(id);
    if (!rec) throw new Error(`command ${id} not found`);
    Object.assign(rec, patch);
    return { ...rec };
  }

  async get(id: string) {
    const rec = this.byId.get(id);
    return rec ? { ...rec } : null;
  }

  async listByVin(vin: string, limit: number) {
    return [...this.byId.values()]
      .filter((c) => c.vin === vin)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((c) => ({ ...c }));
  }

  async countByUserSince(userId: string, sinceIso: string) {
    return [...this.byId.values()].filter((c) => c.userId === userId && c.createdAt >= sinceIso).length;
  }
}
