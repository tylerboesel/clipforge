import Bull from "bull";
import { logger } from "../utils/logger.js";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const url = new URL(redisUrl);

const redisConfig = {
  host: url.hostname,
  port: Number(url.port || 6379),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

if (url.password) {
  redisConfig.password = url.password;
}

if (url.protocol === "rediss:") {
  redisConfig.tls = {};
}

export const clipQueue = new Bull("clip-processing", {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 20,
    timeout: 30 * 60 * 1000,
  },
});

clipQueue.on("failed", (job, err) => {
  logger.error(`Job ${job.id} failed: ${err.message}`);
});

logger.info(`Clip queue connected to Redis at ${redisUrl}`);