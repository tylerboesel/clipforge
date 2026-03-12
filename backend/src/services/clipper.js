import { execa } from "execa";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageDir = process.env.STORAGE_DIR || path.join(__dirname, "../../storage");

// TikTok/Reels target dimensions
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;

/**
 * Cut a clip from a video and convert it to 9:16 vertical format.
 *
 * Strategy:
 *   1. If source is landscape (16:9), crop to 9:16 centered
 *   2. If source is already portrait, scale to fit
 *   3. Add black bars if needed (pillarbox/letterbox)
 *
 * @param {string} videoPath  - Path to source video
 * @param {object} clip       - { start, end, title }
 * @param {string} jobId      - Job identifier
 * @param {number} index      - Clip index (for filename)
 * @returns {Promise<string>} - Path to output clip file
 */
export async function cutAndConvertClip(videoPath, clip, jobId, index) {
  const outputFilename = `${jobId}_clip${index + 1}.mp4`;

  const clipsDir = path.join(storageDir, "clips"); 

  await fs.promises.mkdir(clipsDir, { recursive: true });

  const outputPath = path.join(storageDir, "clips", outputFilename);
  
  const duration = clip.end - clip.start;

  // First, probe the source video dimensions
  const { width: srcW, height: srcH } = await getVideoDimensions(videoPath);
  logger.info(`[clipper] Source: ${srcW}x${srcH}, cutting ${duration.toFixed(1)}s at ${clip.start}s`);

  const vfFilter = buildVideoFilter(srcW, srcH);

  const args = [
    "-ss", String(clip.start),       // seek BEFORE input (fast)
    "-i", videoPath,
    "-t", String(duration),
    "-vf", vfFilter,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",       // web-optimized
    "-y",
    outputPath,
  ];

  await execa("ffmpeg", args);
  logger.info(`[clipper] Wrote ${outputPath}`);
  return outputPath;
}

/**
 * Build an FFmpeg -vf filter string to convert any aspect ratio to 9:16.
 */
function buildVideoFilter(srcW, srcH) {
  const srcAR = srcW / srcH;
  const targetAR = TARGET_WIDTH / TARGET_HEIGHT; // 9/16 = 0.5625

  if (Math.abs(srcAR - targetAR) < 0.05) {
    // Already 9:16, just scale
    return `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}`;
  }

  if (srcAR > targetAR) {
    // Landscape (wider than 9:16) → crop horizontally
    // Crop the center 9:16 portion, then scale
    const cropW = Math.round(srcH * (TARGET_WIDTH / TARGET_HEIGHT));
    const cropX = Math.round((srcW - cropW) / 2);
    return [
      `crop=${cropW}:${srcH}:${cropX}:0`,
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}`,
    ].join(",");
  } else {
    // Portrait or square (narrower than 9:16) → pad with blurred background
    // Technique: scale to fit width, pad height with blurred version of the video
    return [
      // Create blurred background at full 9:16
      `[0:v]scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},boxblur=20:5[bg]`,
      // Scale original to fit within width
      `[0:v]scale=${TARGET_WIDTH}:-2[fg]`,
      // Overlay centered
      `[bg][fg]overlay=(W-w)/2:(H-h)/2`,
    ].join(";");
  }
}

/**
 * Probe video for width/height using ffprobe.
 */
async function getVideoDimensions(videoPath) {
  const { stdout } = await execa("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0",
    videoPath,
  ]);
  const [width, height] = stdout.trim().split(",").map(Number);
  return { width, height };
}

/**
 * Add captions/subtitles burned into the clip.
 * Uses FFmpeg drawtext filter with word-by-word timing from Whisper segments.
 */
export async function addCaptionsToClip(clipPath, segments, clipStart, outputPath) {
  // Build drawtext filter entries for each word
  const clipSegments = segments.filter(
    (s) => s.start >= clipStart && s.end <= clipStart + 180
  );

  if (!clipSegments.length) return clipPath;

  const drawtextFilters = clipSegments.map((seg) => {
    const relStart = (seg.start - clipStart).toFixed(2);
    const relEnd = (seg.end - clipStart).toFixed(2);
    const safeText = seg.text.replace(/'/g, "\\'").replace(/:/g, "\\:");
    return (
      `drawtext=text='${safeText}':` +
      `fontsize=48:fontcolor=white:` +
      `borderw=3:bordercolor=black:` +
      `x=(w-text_w)/2:y=h*0.75:` +
      `enable='between(t,${relStart},${relEnd})'`
    );
  });

  await execa("ffmpeg", [
    "-i", clipPath,
    "-vf", drawtextFilters.join(","),
    "-c:a", "copy",
    "-y",
    outputPath,
  ]);

  return outputPath;
}
