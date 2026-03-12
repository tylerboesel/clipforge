import { Router } from "express";
import { body, param, validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import { clipQueue } from "../services/queue.js";
import { jobStore } from "../services/jobStore.js";
import { detectPlatform } from "../utils/platformDetector.js";
import { logger } from "../utils/logger.js";

export const jobsRouter = Router();

// ── POST /api/jobs — Submit a new video ───────────────────────────────────────
jobsRouter.post(
  "/",
  [
    body("url").isURL().withMessage("A valid video URL is required"),
    body("maxClips").optional().isInt({ min: 1, max: 10 }).withMessage("maxClips must be 1–10"),
    body("minDuration").optional().isInt({ min: 15, max: 60 }).withMessage("minDuration 15–60s"),
    body("maxDuration").optional().isInt({ min: 30, max: 180 }).withMessage("maxDuration 30–180s"),
    body("clipStyle")
      .optional()
      .isIn(["viral", "funny", "highlights", "educational"])
      .withMessage("Invalid clip style"),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { url, maxClips = 5, minDuration = 30, maxDuration = 60, clipStyle = "viral" } = req.body;

      const platform = detectPlatform(url);
      if (!platform) {
        return res.status(400).json({ error: "Unsupported platform. Use YouTube, Kick, or Twitch." });
      }

      const jobId = uuidv4();

      // Persist job metadata
      await jobStore.create(jobId, {
        url,
        platform,
        maxClips,
        minDuration,
        maxDuration,
        clipStyle,
        status: "queued",
        progress: 0,
        createdAt: new Date().toISOString(),
        clips: [],
      });

      // Enqueue background work
      await clipQueue.add(
        { jobId, url, platform, maxClips, minDuration, maxDuration, clipStyle },
        { jobId, attempts: 2, backoff: { type: "exponential", delay: 5000 } }
      );

      logger.info(`Job ${jobId} queued — platform: ${platform}`);
      res.status(202).json({ jobId, status: "queued" });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/jobs/:id — Poll job status ───────────────────────────────────────
jobsRouter.get("/:id", param("id").isUUID(), async (req, res, next) => {
  try {
    const job = await jobStore.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/jobs/:id/clips — List clips for a job ────────────────────────────
jobsRouter.get("/:id/clips", param("id").isUUID(), async (req, res, next) => {
  try {
    const job = await jobStore.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({ clips: job.clips || [] });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/jobs/:id — Cancel / delete ────────────────────────────────────
jobsRouter.delete("/:id", param("id").isUUID(), async (req, res, next) => {
  try {
    const job = await jobStore.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    await jobStore.update(req.params.id, { status: "cancelled" });
    res.json({ message: "Job cancelled" });
  } catch (err) {
    next(err);
  }
});
