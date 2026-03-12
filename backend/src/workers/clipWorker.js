/**
 * ClipForge Worker
 * Processes jobs from the Bull queue through the full pipeline:
 *   download → transcribe → detect highlights → cut clips
 *
 * Run as a separate process: `node src/workers/clipWorker.js`
 */
import "dotenv/config";
import { clipQueue } from "../services/queue.js";
import { jobStore } from "../services/jobStore.js";
import { downloadVideo, getVideoMetadata } from "../services/downloader.js";
import { extractAudio, transcribeAudio } from "../services/transcriber.js";
import { detectHighlights } from "../services/highlightDetector.js";
import { cutAndConvertClip, addCaptionsToClip } from "../services/clipper.js";
import { logger } from "../utils/logger.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { uploadClipToAzure } from "../services/blobStorage.js";

// Download YouTube cookies from Azure Blob Storage at startup
import { BlobServiceClient } from "@azure/storage-blob";

const cookiesPath = "/tmp/yt-cookies.txt";

async function downloadCookies() {
  try {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connStr) return;
    const blobClient = BlobServiceClient.fromConnectionString(connStr)
      .getContainerClient("clips")
      .getBlobClient("yt-cookies.txt");
    await blobClient.downloadToFile(cookiesPath);
    logger.info("[worker] YouTube cookies downloaded successfully");
  } catch (e) {
    logger.warn(`[worker] Could not download cookies: ${e.message}`);
  }
}

await downloadCookies();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "2");

clipQueue.process(CONCURRENCY, async (job) => {
  const { jobId, url, platform, maxClips, minDuration, maxDuration, clipStyle } = job.data;

  const setProgress = async (progress, status, message) => {
    await jobStore.update(jobId, { progress, status, statusMessage: message });
    job.progress(progress);
    logger.info(`[worker][${jobId}] ${progress}% — ${message}`);
  };

  try {
    await setProgress(2, "processing", "Fetching video metadata...");

    // ── Step 1: Metadata ────────────────────────────────────────────────────
    let metadata = {};
    try {
      metadata = await getVideoMetadata(url);
      await jobStore.update(jobId, { metadata });
    } catch (e) {
      logger.warn(`[worker] Could not fetch metadata: ${e.message}`);
    }

    await setProgress(5, "processing", "Downloading video...");

    // ── Step 2: Download ────────────────────────────────────────────────────
    const videoPath = await downloadVideo(url, jobId, (pct) => {
      const mapped = 5 + Math.round(pct * 0.3); // 5–35%
      jobStore.update(jobId, { progress: mapped });
    });

    await setProgress(38, "processing", "Extracting audio for transcription...");

    // ── Step 3: Audio extraction ────────────────────────────────────────────
    const audioPath = await extractAudio(videoPath, jobId);

    await setProgress(42, "processing", "Transcribing audio with Whisper...");

    // ── Step 4: Transcription ───────────────────────────────────────────────
    const segments = await transcribeAudio(audioPath);
    await jobStore.update(jobId, { segmentCount: segments.length });

    // Clean up audio file
    fs.unlink(audioPath, () => {});

    await setProgress(65, "processing", "Analyzing content with AI...");

    // ── Step 5: Highlight detection ─────────────────────────────────────────
    const highlights = await detectHighlights(segments, {
      maxClips,
      minDuration,
      maxDuration,
      clipStyle,
    });

    await setProgress(70, "processing", `Found ${highlights.length} highlights. Cutting clips...`);

    // ── Step 6: Cut clips ───────────────────────────────────────────────────
    const clips = [];
    for (let i = 0; i < highlights.length; i++) {
      const highlight = highlights[i];
      const progressPct = 70 + Math.round(((i + 1) / highlights.length) * 25);

      await setProgress(progressPct, "processing", `Cutting clip ${i + 1} of ${highlights.length}...`);

      const clipPath = await cutAndConvertClip(videoPath, highlight, jobId, i);
      const filename = path.basename(clipPath);
      await uploadClipToAzure(clipPath, filename);

      const clip = {
        id: `${jobId}_clip${i + 1}`,
        filename,
        title: highlight.title || `Clip ${i + 1}`,
        reason: highlight.reason,
        score: highlight.score,
        start: highlight.start,
        end: highlight.end,
        duration: highlight.duration,
        downloadUrl: `/api/clips/${filename}/download`,
        streamUrl: `/api/clips/${filename}/stream`,
      };

      await jobStore.pushClip(jobId, clip);
      clips.push(clip);
    }

    // ── Step 7: Cleanup source video ────────────────────────────────────────
    fs.unlink(videoPath, () => {});

    await setProgress(100, "completed", `Done! Generated ${clips.length} clips.`);
    logger.info(`[worker][${jobId}] ✓ Completed with ${clips.length} clips`);
  } catch (err) {
    logger.error(`[worker][${jobId}] ✗ Failed: ${err.message}`);
    await jobStore.update(jobId, {
      status: "failed",
      error: err.message,
    });
    throw err; // Let Bull handle retry logic
  }
});

logger.info(`ClipForge Worker started (concurrency: ${CONCURRENCY})`);
