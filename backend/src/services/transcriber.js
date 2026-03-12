import OpenAI from "openai";
import { execa } from "execa";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageDir = process.env.STORAGE_DIR || path.join(__dirname, "../../storage");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Extract audio from video file using FFmpeg.
 * Returns path to .mp3 file.
 */
export async function extractAudio(videoPath, jobId) {
  const audioDir = path.join(storageDir, "audio");

  // Ensure the audio directory exists
  await fs.promises.mkdir(audioDir, { recursive: true });

  const audioPath = path.join(audioDir, `${jobId}.mp3`);

  await execa("ffmpeg", [
    "-i", videoPath,
    "-vn",          // no video
    "-ar", "16000", // 16kHz sample rate (Whisper optimal)
    "-ac", "1",     // mono
    "-b:a", "64k",
    "-y",           // overwrite
    audioPath,
  ]);

  logger.info(`[transcriber] Audio extracted to ${audioPath}`);
  return audioPath;
}

/**
 * Transcribe audio using OpenAI Whisper API.
 * Returns segments with timestamps: [{start, end, text}]
 *
 * For long videos (>25MB), the audio is split into chunks first.
 */
export async function transcribeAudio(audioPath) {
  const stat = fs.statSync(audioPath);
  const fileSizeMB = stat.size / (1024 * 1024);

  logger.info(`[transcriber] Transcribing ${audioPath} (${fileSizeMB.toFixed(1)} MB)`);

  let segments = [];

  if (fileSizeMB <= 24) {
    // Direct transcription
    segments = await transcribeChunk(audioPath, 0);
  } else {
    // Split into 10-minute chunks
    segments = await transcribeInChunks(audioPath);
  }

  logger.info(`[transcriber] Got ${segments.length} segments`);
  return segments;
}

async function transcribeChunk(audioPath, offsetSeconds = 0) {
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  return (response.segments || []).map((s) => ({
    start: s.start + offsetSeconds,
    end: s.end + offsetSeconds,
    text: s.text.trim(),
  }));
}

async function transcribeInChunks(audioPath) {
  const CHUNK_SECONDS = 600; // 10 min
  const chunksDir = path.join(storageDir, "audio", "chunks");
  fs.mkdirSync(chunksDir, { recursive: true });

  // Get duration
  const { stdout } = await execa("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    audioPath,
  ]);
  const totalDuration = parseFloat(stdout.trim());

  const allSegments = [];
  let offset = 0;

  while (offset < totalDuration) {
    const chunkPath = path.join(chunksDir, `chunk_${offset}.mp3`);
    await execa("ffmpeg", [
      "-i", audioPath,
      "-ss", String(offset),
      "-t", String(CHUNK_SECONDS),
      "-y",
      chunkPath,
    ]);

    const segments = await transcribeChunk(chunkPath, offset);
    allSegments.push(...segments);
    fs.unlinkSync(chunkPath);
    offset += CHUNK_SECONDS;
  }

  return allSegments;
}
