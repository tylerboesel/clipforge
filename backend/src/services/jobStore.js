import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on("error", (err) => {
  console.error("Redis error:", err.message);
});

export default redis;

const KEY = (id) => `job:${id}`;

export const jobStore = {
  async create(id, data) {
    const job = { id, ...data };
    await redis.set(KEY(id), JSON.stringify(job), "EX", 60 * 60 * 24); // 24hr TTL
    return job;
  },

  async get(id) {
    const raw = await redis.get(KEY(id));
    return raw ? JSON.parse(raw) : null;
  },

  async update(id, patch) {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Job ${id} not found`);
    const updated = { ...existing, ...patch };
    await redis.set(KEY(id), JSON.stringify(updated), "EX", 60 * 60 * 24);
    return updated;
  },

  async pushClip(id, clip) {
    const job = await this.get(id);
    if (!job) throw new Error(`Job ${id} not found`);
    job.clips = [...(job.clips || []), clip];
    await redis.set(KEY(id), JSON.stringify(job), "EX", 60 * 60 * 24);
    return job;
  },

  async list() {
    const keys = await redis.keys("job:*");
    if (!keys.length) return [];
    const values = await redis.mget(...keys);
    return values.filter(Boolean).map((v) => JSON.parse(v));
  },
};