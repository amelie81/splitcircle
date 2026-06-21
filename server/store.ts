// Swappable persistence. The demo engine is a JSON file behind an in-memory
// map with a serialized write queue; replace this module with SQLite/Postgres
// without touching the routes. Amounts persist as strings (see api/wire.ts).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { WireGroup } from '../src/api/wire';

interface Db {
  groups: Record<string, WireGroup>;
}

export class Store {
  private db: Db = { groups: {} };
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.path, 'utf8');
      this.db = JSON.parse(raw) as Db;
      if (!this.db.groups) this.db.groups = {};
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.flush(); // create an empty db file
      } else {
        throw err;
      }
    }
  }

  private async flush(): Promise<void> {
    // serialize writes so concurrent requests can't interleave a partial file
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path, JSON.stringify(this.db, null, 2));
    });
    return this.writeChain;
  }

  getGroup(id: string): WireGroup | null {
    return this.db.groups[id] ?? null;
  }

  async putGroup(group: WireGroup): Promise<WireGroup> {
    this.db.groups[group.id] = group;
    await this.flush();
    return group;
  }

  /** Mutate a group under a read-modify-write and persist atomically. */
  async updateGroup(
    id: string,
    mutate: (g: WireGroup) => void,
  ): Promise<WireGroup | null> {
    const g = this.db.groups[id];
    if (!g) return null;
    mutate(g);
    await this.flush();
    return g;
  }
}
