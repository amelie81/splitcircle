// Swappable persistence. Two backends share one async interface so the routes
// never care which is live:
//   - FileStore  — a JSON file behind an in-memory map (local dev / Node server).
//   - RedisStore — Upstash Redis over HTTP (Vercel serverless, where the
//                  filesystem is ephemeral and there is no long-lived process).
// The backend is chosen by env in createStore(). Amounts persist as strings
// (see api/wire.ts), so every group is plain JSON — safe for either backend.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Redis } from '@upstash/redis';
import type { WireGroup } from '../src/api/wire';

export interface Store {
  getGroup(id: string): Promise<WireGroup | null>;
  putGroup(group: WireGroup): Promise<WireGroup>;
  updateGroup(
    id: string,
    mutate: (g: WireGroup) => void,
  ): Promise<WireGroup | null>;
}

interface Db {
  groups: Record<string, WireGroup>;
}

export class FileStore implements Store {
  private db: Db = { groups: {} };
  private writeChain: Promise<void> = Promise.resolve();
  private loaded = false;

  constructor(private readonly path: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
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
    this.loaded = true;
  }

  private async flush(): Promise<void> {
    // serialize writes so concurrent requests can't interleave a partial file
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path, JSON.stringify(this.db, null, 2));
    });
    return this.writeChain;
  }

  async getGroup(id: string): Promise<WireGroup | null> {
    await this.ensureLoaded();
    return this.db.groups[id] ?? null;
  }

  async putGroup(group: WireGroup): Promise<WireGroup> {
    await this.ensureLoaded();
    this.db.groups[group.id] = group;
    await this.flush();
    return group;
  }

  async updateGroup(
    id: string,
    mutate: (g: WireGroup) => void,
  ): Promise<WireGroup | null> {
    await this.ensureLoaded();
    const g = this.db.groups[id];
    if (!g) return null;
    mutate(g);
    await this.flush();
    return g;
  }
}

export class RedisStore implements Store {
  private readonly key = (id: string) => `splitcircle:group:${id}`;

  constructor(private readonly redis: Redis) {}

  async getGroup(id: string): Promise<WireGroup | null> {
    return (await this.redis.get<WireGroup>(this.key(id))) ?? null;
  }

  async putGroup(group: WireGroup): Promise<WireGroup> {
    await this.redis.set(this.key(group.id), group);
    return group;
  }

  // Read-modify-write. Serverless invocations don't share memory, so there is no
  // in-process lock here; for the demo's request volume a last-write-wins RMW is
  // acceptable, and the matcher's confirmation step is idempotent on top of it.
  async updateGroup(
    id: string,
    mutate: (g: WireGroup) => void,
  ): Promise<WireGroup | null> {
    const g = await this.getGroup(id);
    if (!g) return null;
    mutate(g);
    await this.redis.set(this.key(id), g);
    return g;
  }
}

/** Pick a backend from the environment: Upstash Redis when its REST credentials
 *  are present (Vercel), otherwise a local JSON file. */
export function createStore(opts: { dbPath: string }): Store {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return new RedisStore(new Redis({ url, token }));
  }
  return new FileStore(opts.dbPath);
}
