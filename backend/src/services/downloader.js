import { execa } from "execa";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageDir = process.env.STORAGE_DIR || path.join(__dirname, "../../storage");

/**
 * Download a video using yt-dlp.
 * Supports YouTube, Twitch VODs, and Kick (via generic extractor).
 *
 * @param {string} url        - Video URL
 * @param {string} jobId      - Used to name the output file
 * @param {Function} onProgress - Called with 0–100 progress values
 * @returns {Promise<string>} Path to downloaded video file
 */
export async function downloadVideo(url, jobId, onProgress) {
  const outputPath = path.join(storageDir, "downloads", `${jobId}.%(ext)s`);

  const args = [
    url,
    "--output", outputPath,
    "--format", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
    "--merge-output-format", "mp4",
    "--no-playlist",
    "--no-warnings",
    "--progress",
    "--newline",
    "--cookies", "/tmp/yt-cookies.txt",
  ];

  logger.info(`[downloader] Starting download: ${url}`);

  const proc = execa("yt-dlp", args);

  proc.stdout.on("data", (chunk) => {
    const line = chunk.toString();
    // Parse yt-dlp progress: "[download]  42.3% of ..."
    const match = line.match(/\[download\]\s+([\d.]+)%/);
    if (match && onProgress) {
      onProgress(Math.min(parseFloat(match[1]), 99));
    }
  });

  await proc;

  // Find the actual file written (extension may vary)
  const dir = path.join(storageDir, "downloads");
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(jobId));
  if (!files.length) throw new Error("Download produced no output file");

  const finalPath = path.join(dir, files[0]);
  logger.info(`[downloader] Saved to ${finalPath}`);
  if (onProgress) onProgress(100);
  return finalPath;
}

/**
 * Get video metadata (title, duration, thumbnail) without downloading.
 */
export async function getVideoMetadata(url) {
  const { stdout } = await execa("yt-dlp", [
    url,
    "--dump-json",
    "--no-playlist",
    "--no-warnings",
    "--cookies", "/tmp/yt-cookies.txt",
  ]);
  const meta = JSON.parse(stdout);
  return {
    title: meta.title,
    duration: meta.duration,     // seconds
    thumbnail: meta.thumbnail,
    uploader: meta.uploader,
    platform: meta.extractor_key,
  };
}
