import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

const API = "https://clipforge-backend.azurewebsites.net";

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = ({ path, size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={path} />
  </svg>
);

const ICONS = {
  youtube: "M22.54 6.42a2.78 2.78 0 00-1.94-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.4 19.54C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 001.94-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z",
  scissors: "M6 3a3 3 0 110 6 3 3 0 010-6zM6 15a3 3 0 110 6 3 3 0 010-6zM20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12",
  download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  play: "M5 3l14 9-14 9V3z",
  check: "M20 6L9 17l-5-5",
  zap: "M13 2L3 14h9l-1 10 10-12h-9l1-10z",
  film: "M2 8h20M2 16h20M6 2v20M18 2v20",
  clock: "M12 2a10 10 0 100 20A10 10 0 0012 2zM12 6v6l4 2",
  sparkle: "M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z",
  alert: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
};

// ── API helpers ───────────────────────────────────────────────────────────────
const api = {
  submitJob: (data) => axios.post(`${API}/api/jobs`, data).then((r) => r.data),
  pollJob: (id) => axios.get(`${API}/api/jobs/${id}`).then((r) => r.data),
};

// ── Platform detector ─────────────────────────────────────────────────────────
function detectPlatform(url) {
  if (/youtube|youtu\.be/.test(url)) return "youtube";
  if (/twitch\.tv/.test(url)) return "twitch";
  if (/kick\.com/.test(url)) return "kick";
  return null;
}

const PLATFORM_COLORS = {
  youtube: "#FF0000",
  twitch: "#9146FF",
  kick: "#53FC18",
};

const PLATFORM_LABELS = {
  youtube: "YouTube",
  twitch: "Twitch",
  kick: "Kick",
};

// ── Progress step labels ──────────────────────────────────────────────────────
const STEPS = [
  { min: 0, max: 5, label: "Queued" },
  { min: 5, max: 38, label: "Downloading" },
  { min: 38, max: 65, label: "Transcribing" },
  { min: 65, max: 70, label: "AI Analysis" },
  { min: 70, max: 99, label: "Cutting Clips" },
  { min: 99, max: 100, label: "Done!" },
];

function getStep(progress) {
  return STEPS.find((s) => progress >= s.min && progress <= s.max) || STEPS[0];
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState(null);
  const [settings, setSettings] = useState({
    maxClips: 5,
    minDuration: 30,
    maxDuration: 60,
    clipStyle: "viral",
  });
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef(null);

  // Live URL detection
  useEffect(() => {
    setPlatform(detectPlatform(url));
  }, [url]);

  // Polling
  const startPolling = useCallback((jobId) => {
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.pollJob(jobId);
        setJob(data);
        if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
          clearInterval(pollRef.current);
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    }, 2000);
  }, []);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const handleSubmit = async () => {
    console.log("1 - start");
    if (!url.trim()) return setError("Please enter a video URL");
    if (!platform) return setError("Only YouTube, Twitch VODs, and Kick videos are supported");
    console.log("2 - past validation");
    setError("");
    setSubmitting(true);
    console.log("3 - submitting set to true");
    try {
      console.log("4 - about to call api");
      const result = await api.submitJob({ url, ...settings });
      console.log("5 - api result:", result);
      const { jobId } = result;
      setJob({ id: jobId, status: "queued", progress: 0, clips: [] });
      startPolling(jobId);
    } catch (e) {
      console.error("ERROR:", e);
      console.error("Response:", e.response?.data);
      setError(e.response?.data?.error || e.response?.data?.errors?.[0]?.msg || "Failed to submit job");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    clearInterval(pollRef.current);
    setJob(null);
    setUrl("");
    setPlatform(null);
    setError("");
  };

  return (
    <div className="app">
      <Grain />
      <div className="container">
        <Header />

        <AnimatePresence mode="wait">
          {!job ? (
            <motion.div key="form" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}>
              <SubmitForm
                url={url}
                setUrl={setUrl}
                platform={platform}
                settings={settings}
                setSettings={setSettings}
                onSubmit={handleSubmit}
                submitting={submitting}
                error={error}
              />
            </motion.div>
          ) : (
            <motion.div key="job" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}>
              <JobView job={job} onReset={reset} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="header">
      <div className="logo">
        <div className="logo-icon">
          <Icon path={ICONS.scissors} size={24} />
        </div>
        <div>
          <h1>ClipForge</h1>
          <p className="tagline">AI-powered viral clip generator</p>
        </div>
      </div>
      <div className="badges">
        <span className="badge badge-yt">YouTube</span>
        <span className="badge badge-tw">Twitch</span>
        <span className="badge badge-kk">Kick</span>
      </div>
    </header>
  );
}

function SubmitForm({ url, setUrl, platform, settings, setSettings, onSubmit, submitting, error }) {
  return (
    <div className="card">
      <div className="card-section">
        <label className="label">Video URL</label>
        <div className="url-input-wrap">
          <input
            className="url-input"
            type="url"
            placeholder="Paste YouTube, Twitch VOD, or Kick URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          />
          <AnimatePresence>
            {platform && (
              <motion.span
                className="platform-pill"
                style={{ background: PLATFORM_COLORS[platform] + "22", color: PLATFORM_COLORS[platform], border: `1px solid ${PLATFORM_COLORS[platform]}44` }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                {PLATFORM_LABELS[platform]}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="settings-grid">
        <SettingSelect
          label="Clip Style"
          value={settings.clipStyle}
          onChange={(v) => setSettings((s) => ({ ...s, clipStyle: v }))}
          options={[
            { value: "viral", label: "🔥 Viral" },
            { value: "funny", label: "😂 Funny" },
            { value: "highlights", label: "⚡ Highlights" },
            { value: "educational", label: "💡 Educational" },
          ]}
        />
        <SettingSelect
          label="Max Clips"
          value={settings.maxClips}
          onChange={(v) => setSettings((s) => ({ ...s, maxClips: Number(v) }))}
          options={[1, 2, 3, 5, 8, 10].map((n) => ({ value: n, label: `${n} clips` }))}
        />
        <SettingSelect
          label="Min Length"
          value={settings.minDuration}
          onChange={(v) => setSettings((s) => ({ ...s, minDuration: Number(v) }))}
          options={[15, 20, 30, 45, 60].map((n) => ({ value: n, label: `${n}s` }))}
        />
        <SettingSelect
          label="Max Length"
          value={settings.maxDuration}
          onChange={(v) => setSettings((s) => ({ ...s, maxDuration: Number(v) }))}
          options={[30, 45, 60, 90, 120, 180].map((n) => ({ value: n, label: `${n}s` }))}
        />
      </div>

      {error && (
        <div className="error-box">
          <Icon path={ICONS.alert} size={16} />
          {error}
        </div>
      )}

      <button className="submit-btn" onClick={onSubmit} disabled={submitting || !url}>
        {submitting ? (
          <>
            <span className="spinner" /> Submitting...
          </>
        ) : (
          <>
            <Icon path={ICONS.zap} size={18} />
            Generate Clips
          </>
        )}
      </button>

      <p className="hint">
        <Icon path={ICONS.clock} size={12} />
        Processing typically takes 2–10 minutes depending on video length
      </p>
    </div>
  );
}

function SettingSelect({ label, value, onChange, options }) {
  return (
    <div className="setting">
      <label className="label">{label}</label>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function JobView({ job, onReset }) {
  const step = getStep(job.progress || 0);
  const isRunning = job.status === "processing" || job.status === "queued";
  const isDone = job.status === "completed";
  const isFailed = job.status === "failed";

  return (
    <div className="card">
      {/* Status header */}
      <div className="job-header">
        <div className="job-status-row">
          <div className={`status-dot ${job.status}`} />
          <span className="status-label">{isDone ? "✓ Complete" : isFailed ? "✗ Failed" : step.label}</span>
          <span className="job-id">#{job.id?.slice(0, 8)}</span>
        </div>

        {isRunning && (
          <div className="progress-track">
            <motion.div
              className="progress-fill"
              initial={{ width: 0 }}
              animate={{ width: `${job.progress || 0}%` }}
              transition={{ ease: "easeOut" }}
            />
          </div>
        )}

        {job.statusMessage && (
          <p className="status-message">{job.statusMessage}</p>
        )}
      </div>

      {/* Pipeline steps visualization */}
      {isRunning && (
        <div className="pipeline">
          {STEPS.slice(0, -1).map((s, i) => {
            const done = job.progress > s.max;
            const active = job.progress >= s.min && job.progress <= s.max;
            return (
              <div key={i} className={`pipeline-step ${done ? "done" : active ? "active" : ""}`}>
                <div className="step-dot" />
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Error */}
      {isFailed && (
        <div className="error-box">
          <Icon path={ICONS.alert} size={16} />
          {job.error || "Job failed. Please try again."}
        </div>
      )}

      {/* Clips */}
      {job.clips && job.clips.length > 0 && (
        <div className="clips-section">
          <h3 className="clips-heading">
            <Icon path={ICONS.sparkle} size={16} />
            {job.clips.length} Clip{job.clips.length !== 1 ? "s" : ""} Generated
          </h3>
          <div className="clips-grid">
            {job.clips.map((clip, i) => (
              <ClipCard key={clip.id} clip={clip} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Loading clips placeholder */}
      {isRunning && (
        <div className="loading-clips">
          <div className="pulse-ring" />
          <p>AI is analyzing your video...</p>
        </div>
      )}

      <button className="reset-btn" onClick={onReset}>
        ← Process another video
      </button>
    </div>
  );
}

function ClipCard({ clip, index }) {
  return (
    <motion.div
      className="clip-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
    >
      <div className="clip-header">
        <div className="clip-number">#{index + 1}</div>
        {clip.score && (
          <div className="clip-score">
            <Icon path={ICONS.zap} size={12} />
            {clip.score.toFixed(1)}
          </div>
        )}
      </div>
      <h4 className="clip-title">{clip.title}</h4>
      {clip.reason && <p className="clip-reason">{clip.reason}</p>}
      <div className="clip-meta">
        <span>
          <Icon path={ICONS.clock} size={12} />
          {clip.duration}s
        </span>
        <span>9:16 vertical</span>
      </div>
      <div className="clip-actions">
        {clip.streamUrl && (
          <a href={`${API}${clip.streamUrl}`} target="_blank" rel="noreferrer" className="clip-btn preview-btn">
            <Icon path={ICONS.play} size={14} />
            Preview
          </a>
        )}
        <a href={`${API}${clip.downloadUrl}`} download className="clip-btn download-btn">
          <Icon path={ICONS.download} size={14} />
          Download
        </a>
      </div>
    </motion.div>
  );
}

function Grain() {
  return (
    <svg className="grain" xmlns="http://www.w3.org/2000/svg">
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" opacity="0.035" />
    </svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0f;
    --surface: #111118;
    --surface2: #18181f;
    --border: #ffffff12;
    --border2: #ffffff1e;
    --text: #f0f0f8;
    --muted: #6b6b80;
    --accent: #7c6aff;
    --accent2: #ff6b9d;
    --green: #4ade80;
    --red: #f87171;
    --yellow: #fbbf24;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'DM Mono', monospace;
    min-height: 100vh;
    line-height: 1.6;
  }

  .grain {
    position: fixed; inset: 0; pointer-events: none; z-index: 100;
    width: 100%; height: 100%;
  }

  .app {
    min-height: 100vh;
    background: radial-gradient(ellipse at 20% 0%, #1a0a3a 0%, transparent 60%),
                radial-gradient(ellipse at 80% 100%, #0a1a2a 0%, transparent 60%),
                var(--bg);
  }

  .container {
    max-width: 680px;
    margin: 0 auto;
    padding: 40px 20px 80px;
  }

  /* Header */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 48px;
  }
  .logo { display: flex; align-items: center; gap: 14px; }
  .logo-icon {
    width: 48px; height: 48px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 30px #7c6aff44;
  }
  h1 {
    font-family: 'Syne', sans-serif;
    font-size: 1.7rem; font-weight: 800; letter-spacing: -0.03em;
  }
  .tagline { font-size: 0.72rem; color: var(--muted); letter-spacing: 0.05em; }
  .badges { display: flex; gap: 6px; }
  .badge {
    font-size: 0.65rem; font-weight: 500; padding: 3px 8px;
    border-radius: 20px; letter-spacing: 0.05em;
  }
  .badge-yt { background: #ff000018; color: #ff6666; border: 1px solid #ff000030; }
  .badge-tw { background: #9146ff18; color: #b388ff; border: 1px solid #9146ff30; }
  .badge-kk { background: #53fc1818; color: #4ade80; border: 1px solid #53fc1830; }

  /* Card */
  .card {
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 20px;
    padding: 28px;
    display: flex; flex-direction: column; gap: 24px;
    box-shadow: 0 4px 40px #00000040;
  }
  .card-section { display: flex; flex-direction: column; gap: 8px; }

  .label {
    font-size: 0.72rem; font-weight: 500; color: var(--muted);
    letter-spacing: 0.08em; text-transform: uppercase;
  }

  /* URL Input */
  .url-input-wrap { position: relative; display: flex; align-items: center; }
  .url-input {
    width: 100%; background: var(--surface2);
    border: 1px solid var(--border2); border-radius: 10px;
    color: var(--text); font-family: 'DM Mono', monospace; font-size: 0.85rem;
    padding: 12px 16px; outline: none; transition: border-color 0.2s;
  }
  .url-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px #7c6aff18; }
  .url-input::placeholder { color: var(--muted); }

  .platform-pill {
    position: absolute; right: 10px;
    font-size: 0.68rem; font-weight: 600; padding: 3px 8px; border-radius: 6px;
    letter-spacing: 0.06em; white-space: nowrap;
  }

  /* Settings grid */
  .settings-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .setting { display: flex; flex-direction: column; gap: 6px; }
  .select {
    background: var(--surface2); border: 1px solid var(--border2);
    border-radius: 8px; color: var(--text);
    font-family: 'DM Mono', monospace; font-size: 0.82rem;
    padding: 9px 12px; outline: none; cursor: pointer; transition: border-color 0.2s;
  }
  .select:focus { border-color: var(--accent); }

  /* Submit button */
  .submit-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    background: linear-gradient(135deg, var(--accent), #5a4ad1);
    border: none; border-radius: 12px; color: white;
    font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 700;
    padding: 14px; cursor: pointer; transition: all 0.2s;
    box-shadow: 0 4px 20px #7c6aff30;
  }
  .submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 28px #7c6aff50; }
  .submit-btn:active { transform: translateY(0); }
  .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .spinner {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid #ffffff30; border-top-color: white;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .hint {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.72rem; color: var(--muted); justify-content: center;
  }

  .error-box {
    display: flex; align-items: center; gap: 8px;
    background: #f8717112; border: 1px solid #f8717130;
    border-radius: 10px; padding: 10px 14px;
    color: var(--red); font-size: 0.82rem;
  }

  /* Job view */
  .job-header { display: flex; flex-direction: column; gap: 10px; }
  .job-status-row {
    display: flex; align-items: center; gap: 10px;
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
  }
  .status-dot.queued { background: var(--yellow); box-shadow: 0 0 8px var(--yellow); animation: pulse 1.5s ease-in-out infinite; }
  .status-dot.processing { background: var(--accent); box-shadow: 0 0 8px var(--accent); animation: pulse 1s ease-in-out infinite; }
  .status-dot.completed { background: var(--green); box-shadow: 0 0 8px var(--green); }
  .status-dot.failed { background: var(--red); }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .status-label { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 1rem; }
  .job-id { margin-left: auto; color: var(--muted); font-size: 0.72rem; }

  .progress-track {
    height: 4px; background: var(--border); border-radius: 2px; overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    border-radius: 2px;
    box-shadow: 0 0 8px var(--accent);
  }
  .status-message { font-size: 0.78rem; color: var(--muted); }

  /* Pipeline */
  .pipeline {
    display: flex; gap: 4px; align-items: center;
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 14px;
  }
  .pipeline-step {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.68rem; color: var(--muted); letter-spacing: 0.04em;
    flex: 1; white-space: nowrap;
  }
  .pipeline-step.done { color: var(--green); }
  .pipeline-step.active { color: var(--accent); }
  .step-dot {
    width: 6px; height: 6px; border-radius: 50%; background: currentColor;
    flex-shrink: 0;
  }
  .pipeline-step.active .step-dot { animation: pulse 1s infinite; }

  /* Loading clips */
  .loading-clips {
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    padding: 24px; color: var(--muted); font-size: 0.82rem;
  }
  .pulse-ring {
    width: 40px; height: 40px; border-radius: 50%;
    border: 2px solid var(--accent); border-top-color: transparent;
    animation: spin 1s linear infinite;
  }

  /* Clips */
  .clips-heading {
    font-family: 'Syne', sans-serif; font-weight: 700; font-size: 0.95rem;
    display: flex; align-items: center; gap: 8px; color: var(--text);
  }
  .clips-grid { display: flex; flex-direction: column; gap: 12px; }

  .clip-card {
    background: var(--surface2);
    border: 1px solid var(--border2); border-radius: 14px;
    padding: 16px; display: flex; flex-direction: column; gap: 8px;
    transition: border-color 0.2s;
  }
  .clip-card:hover { border-color: var(--accent); }

  .clip-header { display: flex; align-items: center; gap: 8px; }
  .clip-number {
    font-size: 0.7rem; font-weight: 600; color: var(--accent);
    background: #7c6aff18; border: 1px solid #7c6aff30;
    padding: 2px 8px; border-radius: 20px;
  }
  .clip-score {
    display: flex; align-items: center; gap: 4px;
    font-size: 0.7rem; color: var(--yellow); margin-left: auto;
  }
  .clip-title {
    font-family: 'Syne', sans-serif; font-weight: 700; font-size: 0.9rem;
  }
  .clip-reason { font-size: 0.78rem; color: var(--muted); }
  .clip-meta {
    display: flex; gap: 14px;
    font-size: 0.68rem; color: var(--muted);
  }
  .clip-meta span { display: flex; align-items: center; gap: 4px; }
  .clip-actions { display: flex; gap: 8px; margin-top: 4px; }
  .clip-btn {
    display: flex; align-items: center; gap: 6px;
    font-family: 'DM Mono', monospace; font-size: 0.75rem; font-weight: 500;
    padding: 7px 14px; border-radius: 8px; cursor: pointer;
    text-decoration: none; transition: all 0.15s;
  }
  .preview-btn {
    background: var(--surface); border: 1px solid var(--border2); color: var(--text);
  }
  .preview-btn:hover { border-color: var(--accent); color: var(--accent); }
  .download-btn {
    background: linear-gradient(135deg, var(--accent), #5a4ad1);
    border: none; color: white; flex: 1; justify-content: center;
    box-shadow: 0 2px 10px #7c6aff30;
  }
  .download-btn:hover { box-shadow: 0 4px 16px #7c6aff50; transform: translateY(-1px); }

  /* Reset */
  .reset-btn {
    background: none; border: 1px solid var(--border2); border-radius: 10px;
    color: var(--muted); font-family: 'DM Mono', monospace; font-size: 0.8rem;
    padding: 10px; cursor: pointer; transition: all 0.2s;
  }
  .reset-btn:hover { border-color: var(--border2); color: var(--text); background: var(--surface2); }

  .clips-section { display: flex; flex-direction: column; gap: 14px; }

  @media (max-width: 480px) {
    .header { flex-direction: column; align-items: flex-start; gap: 12px; }
    .settings-grid { grid-template-columns: 1fr; }
    .pipeline { flex-wrap: wrap; }
  }
`;
