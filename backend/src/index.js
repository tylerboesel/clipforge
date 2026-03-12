import "dotenv/config";
import express from "express";
import cors from "cors";
import { jobsRouter } from "./routes/jobs.js";
import { clipsRouter } from "./routes/clips.js";
import { errorHandler } from "./utils/errorHandler.js";
import { logger } from "./utils/logger.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Storage directories ───────────────────────────────────────────────────────
const storageDir = process.env.STORAGE_DIR || path.join(__dirname, "../storage");
["downloads", "clips", "audio"].forEach((sub) => {
  fs.mkdirSync(path.join(storageDir, sub), { recursive: true });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/jobs", jobsRouter);
app.use("/api/clips", clipsRouter);

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`ClipForge API running on http://localhost:${PORT}`);
});

export default app;
