import OpenAI from "openai";
import { logger } from "../utils/logger.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const STYLE_PROMPTS = {
  viral: "Focus on moments with the highest shock value, unexpected reactions, big reveals, or extremely funny exchanges that would make someone stop scrolling.",
  funny: "Focus on the funniest moments: jokes landing, awkward pauses, comedic misunderstandings, reactions, and unexpected humor.",
  highlights: "Focus on peak action moments: big plays, record-breaking moments, clutch performances, or intense competitive action.",
  educational: "Focus on the clearest, most insightful explanations or 'aha moment' segments that provide standalone value.",
};

/**
 * Use GPT-4 to analyze a transcript and identify the best clip windows.
 *
 * @param {Array<{start, end, text}>} segments  - Whisper segments
 * @param {object} options
 * @param {number} options.maxClips             - Max clips to return
 * @param {number} options.minDuration          - Min clip seconds
 * @param {number} options.maxDuration          - Max clip seconds
 * @param {string} options.clipStyle            - viral | funny | highlights | educational
 * @returns {Promise<Array<{start, end, title, reason, score}>>}
 */
export async function detectHighlights(segments, options) {
  const { maxClips, minDuration, maxDuration, clipStyle } = options;
  const styleInstruction = STYLE_PROMPTS[clipStyle] || STYLE_PROMPTS.viral;

  // Condense transcript into a compact form for the prompt
  const transcriptText = segments
    .map((s) => `[${formatTime(s.start)}-${formatTime(s.end)}] ${s.text}`)
    .join("\n");

  const systemPrompt = `You are an expert social media content editor specializing in short-form viral video content.
Your task is to analyze video transcripts and identify the best moments to cut into TikTok/Reels clips.

${styleInstruction}

Rules:
- Each clip must be between ${minDuration} and ${maxDuration} seconds long
- Clips should have a clear beginning and end (don't cut mid-sentence)
- Prefer moments with strong emotional hooks, punchlines, or natural story arcs
- Return ONLY valid JSON — no markdown, no explanation

Output format (JSON array):
[
  {
    "start": 142.5,
    "end": 178.0,
    "title": "Short catchy title for this clip",
    "reason": "Why this is a great clip (1-2 sentences)",
    "score": 9.2
  }
]`;

  const userMessage = `Here is the video transcript with timestamps:\n\n${transcriptText}\n\nFind the top ${maxClips} best clip moments. Return JSON only.`;

  logger.info(`[highlight-detector] Sending ${segments.length} segments to GPT-4`);

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
    max_tokens: 2000,
  });

  let parsed = [];

try {
  const raw = response.choices[0].message.content;

  logger.info(`[highlight-detector] transcript segment count: ${segments?.length || 0}`);
  logger.info(`[highlight-detector] minDuration=${minDuration}, maxDuration=${maxDuration}, maxClips=${maxClips}`);
  logger.info(`[highlight-detector] raw response: ${raw}`);

  const cleaned = raw
    .replace(/```json\s*/i, "")
    .replace(/```/g, "")
    .trim();

  const obj = JSON.parse(cleaned);

  if (Array.isArray(obj)) {
    parsed = obj;
  } else if (Array.isArray(obj.clips)) {
    parsed = obj.clips;
  } else if (Array.isArray(obj.highlights)) {
    parsed = obj.highlights;
  } else if (obj.clips && typeof obj.clips === "object") {
    parsed = [obj.clips];
  } else if (obj.highlights && typeof obj.highlights === "object") {
    parsed = [obj.highlights];
  } else {
    const firstValue = Object.values(obj || {})[0];
    parsed = Array.isArray(firstValue)
      ? firstValue
      : firstValue && typeof firstValue === "object"
        ? [firstValue]
        : [];
  }

  logger.info(`[highlight-detector] parsed value: ${JSON.stringify(parsed)}`);
  logger.info(`[highlight-detector] parsed is array: ${Array.isArray(parsed)}`);
} catch (e) {
  throw new Error(`GPT-4 returned invalid JSON: ${e.message}`);
}

const clips = (Array.isArray(parsed) ? parsed : [])
  .map((c) => ({
    ...c,
    start: Number(c.start),
    end: Number(c.end),
    score: Number(c.score) || 0,
  }))
  .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start)
  .map((c) => ({
    ...c,
    start: Math.max(0, c.start),
    end: c.end,
    duration: Math.round(c.end - c.start),
  }))
  .filter((c) => c.duration >= minDuration && c.duration <= maxDuration)
  .sort((a, b) => (b.score || 0) - (a.score || 0))
  .slice(0, maxClips);

logger.info(`[highlight-detector] final clips: ${JSON.stringify(clips)}`);
logger.info(`[highlight-detector] final clip count: ${clips.length}`);

return clips;
}



function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}
