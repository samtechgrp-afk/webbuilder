/**
 * Embeds for the video and map widgets. Only addresses we can turn into a
 * known, privacy-friendly embed are accepted; anything else is refused on
 * save, so a widget can never frame an arbitrary page.
 */

export type ParsedVideo =
  | { kind: "youtube"; id: string; start?: number }
  | { kind: "vimeo"; id: string }
  | { kind: "file"; src: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** A media library audio file, or an https .mp3 / .m4a / .aac / .ogg / .oga / .wav / .weba address. */
export function parseAudioUrl(src: string): string | null {
  if (!src) return null;
  if (/^\/uploads\/[A-Za-z0-9/_.-]+\.(mp3|m4a|aac|ogg|oga|wav|weba)$/i.test(src)) return src;
  try {
    const url = new URL(src);
    return url.protocol === "https:" && /\.(mp3|m4a|aac|ogg|oga|wav|weba)$/i.test(url.pathname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseVideoUrl(src: string): ParsedVideo | null {
  if (!src) return null;
  // Our own uploads (local driver) or a media URL resolved by the server.
  if (/^\/uploads\/[A-Za-z0-9/_.-]+\.(mp4|webm)$/i.test(src)) return { kind: "file", src };
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^(www|m)\./, "");
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1];
    return id && YT_ID.test(id) ? { kind: "youtube", id, start: seconds(url.searchParams.get("t") ?? url.searchParams.get("start")) } : null;
  }
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return YT_ID.test(id) ? { kind: "youtube", id, start: seconds(url.searchParams.get("t")) } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.match(/(?:^|\/)(\d{6,12})(?:\/|$)/)?.[1];
    return id ? { kind: "vimeo", id } : null;
  }
  if (/\.(mp4|webm)$/i.test(url.pathname)) return { kind: "file", src: url.toString() };
  return null;
}

function seconds(t: string | null): number | undefined {
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return +t;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return undefined;
  const total = (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + +(m[3] ?? 0);
  return total || undefined;
}

export interface VideoOptions {
  autoplay?: boolean;
  loop?: boolean;
  controls?: boolean;
  muted?: boolean;
}

/** The iframe address for a YouTube or Vimeo video, with playback options applied. */
export function embedUrl(v: Extract<ParsedVideo, { kind: "youtube" | "vimeo" }>, o: VideoOptions): string {
  const muted = o.autoplay || o.muted;
  if (v.kind === "youtube") {
    const q = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" });
    if (o.autoplay) q.set("autoplay", "1");
    if (muted) q.set("mute", "1");
    if (o.controls === false) q.set("controls", "0");
    if (o.loop) {
      q.set("loop", "1");
      q.set("playlist", v.id);
    }
    if (v.start) q.set("start", String(v.start));
    return `https://www.youtube-nocookie.com/embed/${v.id}?${q}`;
  }
  const q = new URLSearchParams({ dnt: "1" });
  if (o.autoplay) q.set("autoplay", "1");
  if (muted) q.set("muted", "1");
  if (o.loop) q.set("loop", "1");
  if (o.controls === false) q.set("controls", "0");
  return `https://player.vimeo.com/video/${v.id}?${q}`;
}

/** A keyless Google Maps embed for an address. */
export function mapEmbedUrl(address: string, zoom: number, mapType: string) {
  const q = new URLSearchParams({ q: address, z: String(Math.round(zoom)), t: mapType === "satellite" ? "k" : "m", output: "embed" });
  return `https://maps.google.com/maps?${q}`;
}
