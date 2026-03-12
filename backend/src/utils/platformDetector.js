const PLATFORMS = {
  youtube: [/youtube\.com\/watch/, /youtu\.be\//, /youtube\.com\/live\//],
  twitch: [/twitch\.tv\/videos\//, /twitch\.tv\/\w+\/clip\//],
  kick: [/kick\.com\/video\//, /kick\.com\/\w+\?clip=/],
};

/**
 * Detect platform from URL.
 * @param {string} url
 * @returns {"youtube"|"twitch"|"kick"|null}
 */
export function detectPlatform(url) {
  for (const [platform, patterns] of Object.entries(PLATFORMS)) {
    if (patterns.some((re) => re.test(url))) return platform;
  }
  return null;
}
