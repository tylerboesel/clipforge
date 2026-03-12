# ClipForge — AI-Powered Short Clip Generator

Automatically extract the best moments from YouTube, Kick, and Twitch videos and export them as TikTok-ready 9:16 vertical clips.

## Architecture Overview

```
clipforge/
├── frontend/          # React + Vite SPA
├── backend/           # Node.js + Express API
└── shared/            # Shared types/constants
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TailwindCSS |
| Backend | Node.js, Express |
| Video Download | yt-dlp |
| Video Processing | FFmpeg |
| AI Analysis | OpenAI Whisper (transcription) + GPT-4 (highlight detection) |
| Queue | Bull (Redis-backed job queue) |
| Storage | Local disk / S3-compatible |

## Setup

### Prerequisites
- Node.js 18+
- Python 3.10+
- FFmpeg installed (`brew install ffmpeg` / `apt install ffmpeg`)
- yt-dlp installed (`pip install yt-dlp`)
- Redis running locally or via Docker
- OpenAI API key

### Install

```bash
# Backend
cd backend
npm install
cp .env.example .env   # fill in your keys
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

### Environment Variables

```env
OPENAI_API_KEY=sk-...
REDIS_URL=redis://localhost:6379
STORAGE_DIR=./storage
PORT=3001
```

## How It Works

1. **User submits a video URL** (YouTube, Kick, Twitch VOD)
2. **yt-dlp downloads** the video to local storage
3. **FFmpeg extracts audio** for transcription
4. **Whisper transcribes** the audio with timestamps
5. **GPT-4 analyzes** the transcript to find highlight moments (peak emotion, big plays, viral hooks)
6. **FFmpeg crops** those segments to 9:16 vertical format (smart crop or center crop)
7. **Clips are returned** as downloadable MP4 files

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /api/jobs | Submit a new video URL |
| GET | /api/jobs/:id | Get job status & progress |
| GET | /api/jobs/:id/clips | List generated clips |
| GET | /api/clips/:id/download | Download a specific clip |
| DELETE | /api/jobs/:id | Cancel/delete a job |

