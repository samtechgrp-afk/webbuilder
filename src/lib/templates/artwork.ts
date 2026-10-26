import type { Blueprint, ImageSpec } from "./types";

/**
 * Generated artwork, so starter sites ship with on-brand pictures without
 * bundling stock photos (and their licences). Each motif is a small SVG
 * drawn from the blueprint's palette; the seeder converts it to WebP through
 * the normal media pipeline, and the gallery preview shows the SVG directly.
 */

type Palette = [string, string, string, string];

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Default palette from the blueprint's own colours (falls back to neutrals for non-hex tokens). */
export function blueprintPalette(bp: Blueprint): Palette {
  const c = bp.tokens.colors;
  const pick = (v: string, fallback: string) => (HEX.test(v) ? v : fallback);
  return [pick(c["surface-mid"], "#EDEDED"), pick(c["surface-high"], "#F7F7F7"), pick(c.primary, "#333333"), pick(c.accent, "#888888")];
}

/** A small deterministic random sequence, so the same image key always draws the same picture. */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const f = (n: number) => Math.round(n * 10) / 10;

export function artworkSvg(spec: ImageSpec, fallback: Palette): string {
  const [bg, mid, shape, detail] = spec.palette ?? fallback;
  const { width: w, height: h } = spec;
  const r = rng(spec.key);
  const m = Math.min(w, h);
  let body = "";
  switch (spec.motif) {
    case "aurora": {
      body = `<rect width="${w}" height="${h}" fill="${bg}"/>`;
      for (let i = 0; i < 4; i++) {
        const color = [shape, detail, mid, shape][i];
        body += `<ellipse cx="${f(w * (0.15 + r() * 0.7))}" cy="${f(h * (0.2 + r() * 0.6))}" rx="${f(m * (0.35 + r() * 0.3))}" ry="${f(m * (0.2 + r() * 0.2))}" fill="${color}" opacity="${f(0.35 + r() * 0.3)}" filter="url(#b)"/>`;
      }
      body += `<g stroke="${mid}" stroke-opacity=".18">${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${f((h / 12) * i)}" x2="${w}" y2="${f((h / 12) * i)}"/>`).join("")}</g>`;
      break;
    }
    case "interface": {
      const pad = m * 0.08;
      body = `<rect width="${w}" height="${h}" fill="${bg}"/><rect x="${f(pad)}" y="${f(pad)}" width="${f(w - pad * 2)}" height="${f(h - pad * 2)}" rx="${f(m * 0.03)}" fill="${mid}" stroke="${shape}" stroke-opacity=".25"/>`;
      body += `<rect x="${f(pad)}" y="${f(pad)}" width="${f(w - pad * 2)}" height="${f(m * 0.07)}" rx="${f(m * 0.03)}" fill="${shape}" opacity=".12"/>`;
      for (let i = 0; i < 3; i++) body += `<circle cx="${f(pad + m * (0.03 + i * 0.03))}" cy="${f(pad + m * 0.035)}" r="${f(m * 0.009)}" fill="${detail}"/>`;
      const sideW = (w - pad * 2) * 0.22;
      body += `<rect x="${f(pad + m * 0.03)}" y="${f(pad + m * 0.11)}" width="${f(sideW)}" height="${f(h - pad * 2 - m * 0.14)}" rx="${f(m * 0.015)}" fill="${shape}" opacity=".08"/>`;
      for (let i = 0; i < 6; i++) body += `<rect x="${f(pad + m * 0.05)}" y="${f(pad + m * (0.14 + i * 0.06))}" width="${f(sideW * (0.5 + r() * 0.4))}" height="${f(m * 0.018)}" rx="4" fill="${shape}" opacity=".3"/>`;
      const x0 = pad + sideW + m * 0.06;
      const cw = w - pad - x0 - m * 0.03;
      const bars = 9;
      for (let i = 0; i < bars; i++) {
        const bh = (h * 0.32) * (0.3 + r() * 0.7);
        body += `<rect x="${f(x0 + (cw / bars) * i + 4)}" y="${f(h - pad - m * 0.06 - bh)}" width="${f(cw / bars - 8)}" height="${f(bh)}" rx="4" fill="${i % 3 === 0 ? detail : shape}" opacity="${i % 3 === 0 ? 0.9 : 0.55}"/>`;
      }
      for (let i = 0; i < 3; i++) body += `<rect x="${f(x0 + (cw / 3) * i)}" y="${f(pad + m * 0.11)}" width="${f(cw / 3 - 12)}" height="${f(m * 0.14)}" rx="${f(m * 0.015)}" fill="${bg}" stroke="${shape}" stroke-opacity=".15"/><rect x="${f(x0 + (cw / 3) * i + 14)}" y="${f(pad + m * 0.15)}" width="${f((cw / 3) * 0.45)}" height="${f(m * 0.03)}" rx="4" fill="${shape}" opacity=".7"/>`;
      break;
    }
    case "arch": {
      body = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>`;
      body += `<path d="M${f(w * 0.2)} ${h} V${f(h * 0.42)} a${f(w * 0.3)} ${f(w * 0.3)} 0 0 1 ${f(w * 0.6)} 0 V${h}" fill="${shape}" opacity=".85"/>`;
      body += `<rect x="0" y="${f(h * 0.8)}" width="${w}" height="${f(h * 0.2)}" fill="${detail}" opacity=".85"/><circle cx="${f(w * (0.62 + r() * 0.15))}" cy="${f(h * 0.3)}" r="${f(m * 0.08)}" fill="${bg}" opacity=".6"/>`;
      break;
    }
    case "object": {
      body = `<rect width="${w}" height="${h}" fill="${bg}"/><ellipse cx="${f(w / 2)}" cy="${f(h * 0.8)}" rx="${f(w * 0.32)}" ry="${f(h * 0.05)}" fill="${detail}" opacity=".25"/>`;
      const kind = Math.floor(r() * 3);
      if (kind === 0) body += `<path d="M${f(w * 0.38)} ${f(h * 0.78)} C${f(w * 0.3)} ${f(h * 0.5)} ${f(w * 0.36)} ${f(h * 0.4)} ${f(w * 0.44)} ${f(h * 0.3)} L${f(w * 0.44)} ${f(h * 0.2)} L${f(w * 0.56)} ${f(h * 0.2)} L${f(w * 0.56)} ${f(h * 0.3)} C${f(w * 0.64)} ${f(h * 0.4)} ${f(w * 0.7)} ${f(h * 0.5)} ${f(w * 0.62)} ${f(h * 0.78)} Z" fill="${shape}"/>`;
      else if (kind === 1) body += `<rect x="${f(w * 0.3)}" y="${f(h * 0.3)}" width="${f(w * 0.4)}" height="${f(h * 0.48)}" rx="${f(m * 0.04)}" fill="${shape}"/><rect x="${f(w * 0.36)}" y="${f(h * 0.4)}" width="${f(w * 0.28)}" height="${f(h * 0.12)}" rx="4" fill="${mid}" opacity=".8"/>`;
      else body += `<circle cx="${f(w / 2)}" cy="${f(h * 0.52)}" r="${f(m * 0.26)}" fill="${shape}"/><circle cx="${f(w / 2)}" cy="${f(h * 0.52)}" r="${f(m * 0.16)}" fill="${mid}" opacity=".7"/>`;
      body += `<circle cx="${f(w * 0.78)}" cy="${f(h * 0.2)}" r="${f(m * 0.05)}" fill="${detail}" opacity=".6"/>`;
      break;
    }
    case "portrait": {
      body = `<rect width="${w}" height="${h}" fill="${bg}"/><circle cx="${f(w * 0.72)}" cy="${f(h * 0.25)}" r="${f(m * 0.22)}" fill="${mid}" opacity=".7"/>`;
      body += `<circle cx="${f(w / 2)}" cy="${f(h * 0.4)}" r="${f(m * 0.16)}" fill="${shape}"/><path d="M${f(w * 0.18)} ${h} C${f(w * 0.2)} ${f(h * 0.68)} ${f(w * 0.36)} ${f(h * 0.6)} ${f(w / 2)} ${f(h * 0.6)} C${f(w * 0.64)} ${f(h * 0.6)} ${f(w * 0.8)} ${f(h * 0.68)} ${f(w * 0.82)} ${h} Z" fill="${shape}"/>`;
      break;
    }
    case "landscape": {
      body = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${bg}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>`;
      body += `<circle cx="${f(w * (0.6 + r() * 0.25))}" cy="${f(h * 0.32)}" r="${f(m * 0.1)}" fill="${detail}" opacity=".9"/>`;
      body += `<path d="M0 ${f(h * 0.62)} Q${f(w * 0.25)} ${f(h * 0.45)} ${f(w * 0.5)} ${f(h * 0.6)} T${w} ${f(h * 0.55)} V${h} H0 Z" fill="${shape}" opacity=".55"/>`;
      body += `<path d="M0 ${f(h * 0.75)} Q${f(w * 0.3)} ${f(h * 0.62)} ${f(w * 0.6)} ${f(h * 0.74)} T${w} ${f(h * 0.7)} V${h} H0 Z" fill="${shape}"/>`;
      break;
    }
    case "plate": {
      body = `<rect width="${w}" height="${h}" fill="${bg}"/><circle cx="${f(w / 2)}" cy="${f(h / 2)}" r="${f(m * 0.36)}" fill="${mid}"/><circle cx="${f(w / 2)}" cy="${f(h / 2)}" r="${f(m * 0.27)}" fill="${bg}" opacity=".6"/>`;
      for (let i = 0; i < 5; i++) body += `<circle cx="${f(w / 2 + (r() - 0.5) * m * 0.3)}" cy="${f(h / 2 + (r() - 0.5) * m * 0.3)}" r="${f(m * (0.04 + r() * 0.05))}" fill="${i % 2 ? detail : shape}"/>`;
      body += `<rect x="${f(w * 0.86)}" y="${f(h * 0.15)}" width="${f(m * 0.025)}" height="${f(h * 0.7)}" rx="6" fill="${detail}" opacity=".6"/>`;
      break;
    }
    case "skyline": {
      body = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${bg}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>`;
      let x = 0;
      while (x < w) {
        const bw = w * (0.06 + r() * 0.1);
        const bh = h * (0.25 + r() * 0.5);
        body += `<rect x="${f(x)}" y="${f(h - bh)}" width="${f(bw - 4)}" height="${f(bh)}" fill="${shape}" opacity="${f(0.6 + r() * 0.4)}"/>`;
        for (let wy = h - bh + 14; wy < h - 10; wy += 22) body += `<rect x="${f(x + 8)}" y="${f(wy)}" width="${f(Math.max(bw - 20, 4))}" height="6" fill="${detail}" opacity=".35"/>`;
        x += bw;
      }
      break;
    }
    case "pattern": {
      body = `<rect width="${w}" height="${h}" fill="${bg}"/>`;
      const step = m / 6;
      for (let y = 0; y < h + step; y += step) {
        for (let x = 0; x < w + step; x += step) {
          const k = r();
          if (k < 0.3) body += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(step * 0.32)}" fill="${shape}" opacity=".8"/>`;
          else if (k < 0.55) body += `<rect x="${f(x - step * 0.3)}" y="${f(y - step * 0.3)}" width="${f(step * 0.6)}" height="${f(step * 0.6)}" fill="${detail}" opacity=".7"/>`;
          else if (k < 0.7) body += `<path d="M${f(x - step * 0.35)} ${f(y + step * 0.3)} L${f(x)} ${f(y - step * 0.3)} L${f(x + step * 0.35)} ${f(y + step * 0.3)} Z" fill="${mid}"/>`;
        }
      }
      break;
    }
    case "device": {
      body = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>`;
      const dh = h * 0.78;
      const dw = Math.min(dh * 0.5, w * 0.42);
      const x = (w - dw) / 2;
      const y = (h - dh) / 2;
      body += `<rect x="${f(x)}" y="${f(y)}" width="${f(dw)}" height="${f(dh)}" rx="${f(dw * 0.16)}" fill="${shape}"/><rect x="${f(x + dw * 0.06)}" y="${f(y + dw * 0.06)}" width="${f(dw * 0.88)}" height="${f(dh - dw * 0.12)}" rx="${f(dw * 0.12)}" fill="${bg}"/>`;
      for (let i = 0; i < 4; i++) body += `<rect x="${f(x + dw * 0.14)}" y="${f(y + dh * (0.16 + i * 0.17))}" width="${f(dw * 0.72)}" height="${f(dh * 0.12)}" rx="${f(dw * 0.05)}" fill="${i === 0 ? detail : mid}" opacity="${i === 0 ? 0.9 : 0.8}"/>`;
      body += `<circle cx="${f(w * 0.18)}" cy="${f(h * 0.22)}" r="${f(m * 0.09)}" fill="${detail}" opacity=".45"/>`;
      break;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(m * 0.08)}"/></filter></defs>${body}</svg>`;
}

/** The file name the media library derives a title and alt text from. */
export const artworkFileName = (spec: ImageSpec) =>
  `${spec.alt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || spec.key}.png`;
