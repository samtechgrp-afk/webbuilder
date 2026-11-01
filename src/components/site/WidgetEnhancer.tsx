"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for interactive widgets on the live site. The
 * widgets are server-rendered HTML that already works without JavaScript (a
 * lightbox link opens the image itself, a carousel swipes with CSS scroll
 * snapping, a countdown shows its end date, a counter shows its number,
 * accordions and tabs need no script at all); this adds the nicer behaviour on
 * top, through event delegation, so it needs no per-widget hydration and is
 * rendered once per page, only on pages that use such widgets.
 */
export function WidgetEnhancer() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[data-lightbox]");
      if (!link || !link.closest(".site-root")) return;
      e.preventDefault();
      openLightbox(link);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    const roots = Array.from(document.querySelectorAll<HTMLElement>(".site-root"));
    const find = (sel: string) => roots.flatMap((r) => Array.from(r.querySelectorAll<HTMLElement>(sel)));
    const cleanups = [
      ...find('[data-w="carousel"]').map(carousel),
      ...find('[data-w="countdown"][data-target]').map(countdown),
      ...find('[data-w="counter"][data-count-to]').map(counter),
      ...find('[data-w="nav"]').map(navDrawer),
    ];
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      document.querySelector("dialog.wb-lightbox")?.remove();
      for (const c of cleanups) c();
    };
  }, []);
  return null;
}

/**
 * Contact form and Newsletter: send in place and show the answer (or each
 * field's problem) without leaving the page. Without JavaScript the browser
 * posts the form itself and the server answers with a small page.
 */
function onSubmit(e: SubmitEvent) {
  const form = e.target as HTMLFormElement | null;
  if (!form?.matches?.("form[data-wb-form]") || !form.closest(".site-root") || !form.action) return;
  e.preventDefault();
  if (form.getAttribute("aria-busy") === "true") return;
  const status = form.querySelector<HTMLElement>("[data-form-status]");
  const say = (text: string, tone?: "error") => {
    if (!status) return;
    status.textContent = text;
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
  };
  for (const el of Array.from(form.querySelectorAll("[aria-invalid]"))) el.removeAttribute("aria-invalid");
  for (const el of Array.from(form.querySelectorAll<HTMLElement>("[data-field-error]"))) el.textContent = "";
  const body = new FormData(form);
  form.setAttribute("aria-busy", "true");
  say("Sending…");
  fetch(form.action, { method: "POST", body, headers: { accept: "application/json" } })
    .then(async (res) => {
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; errors?: Record<string, string> };
      if (res.ok && data.ok) {
        form.reset();
        say("");
        form.setAttribute("data-sent", "");
        const done = form.querySelector<HTMLElement>("[data-form-success]");
        if (done) {
          done.hidden = false;
          done.setAttribute("tabindex", "-1");
          done.focus();
        }
        return;
      }
      let first: HTMLElement | null = null;
      for (const [name, message] of Object.entries(data.errors ?? {})) {
        const input = form.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
        if (!input) continue;
        input.setAttribute("aria-invalid", "true");
        const holder = input.closest("[data-field]") ?? input.closest("[data-form-body]");
        const slot = holder?.querySelector<HTMLElement>("[data-field-error]");
        if (slot) slot.textContent = message;
        first ??= input;
      }
      say(data.message ?? "Something went wrong. Please try again.", "error");
      first?.focus();
    })
    .catch(() => say("We couldn't reach the server. Check your connection and try again.", "error"))
    .finally(() => form.removeAttribute("aria-busy"));
}

/**
 * The menu drawer already opens and closes without JavaScript (a checkbox);
 * this adds Esc to close, closes it when a link is followed (in-page anchors
 * included) and keeps the page behind from scrolling while it's open.
 */
function navDrawer(root: HTMLElement): () => void {
  const toggle = root.querySelector<HTMLInputElement>("[data-nav-toggle]");
  if (!toggle) return () => {};
  const sync = () => {
    toggle.setAttribute("aria-expanded", String(toggle.checked));
    document.documentElement.style.overflow = toggle.checked && getComputedStyle(toggle).display !== "none" ? "hidden" : "";
  };
  const close = () => {
    if (!toggle.checked) return;
    toggle.checked = false;
    sync();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !toggle.checked) return;
    close();
    toggle.focus();
  };
  const onClick = (e: MouseEvent) => (e.target as Element | null)?.closest?.("a") && close();
  toggle.addEventListener("change", sync);
  document.addEventListener("keydown", onKey);
  root.addEventListener("click", onClick);
  sync();
  return () => {
    toggle.removeEventListener("change", sync);
    document.removeEventListener("keydown", onKey);
    root.removeEventListener("click", onClick);
    document.documentElement.style.overflow = "";
  };
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Arrows, dots and autoplay on top of a CSS scroll-snap track (which already swipes without JS). */
function carousel(root: HTMLElement): () => void {
  const track = root.querySelector<HTMLElement>("[data-track]");
  if (!track || root.hasAttribute("data-ready")) return () => {};
  const slides = Array.from(track.querySelectorAll<HTMLElement>("[data-slide]"));
  const dots = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-dot]"));
  const prev = root.querySelector<HTMLButtonElement>("[data-prev]");
  const next = root.querySelector<HTMLButtonElement>("[data-next]");
  const loop = root.hasAttribute("data-loop");
  const current = () => {
    const left = track.scrollLeft;
    let best = 0;
    slides.forEach((s, i) => {
      if (Math.abs(s.offsetLeft - track.offsetLeft - left) < Math.abs(slides[best].offsetLeft - track.offsetLeft - left)) best = i;
    });
    return best;
  };
  const lastStart = () => Math.max(0, slides.length - Math.round(track.clientWidth / (slides[0]?.clientWidth || 1)));
  const go = (i: number) => {
    const max = lastStart();
    const target = i > max ? (loop ? 0 : max) : i < 0 ? (loop ? max : 0) : i;
    track.scrollTo({ left: slides[target].offsetLeft - track.offsetLeft, behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const sync = () => {
    const i = current();
    dots.forEach((d, j) => d.setAttribute("aria-current", String(i === j)));
    if (!loop) {
      if (prev) prev.disabled = i <= 0;
      if (next) next.disabled = i >= lastStart();
    }
  };
  const onPrev = () => go(current() - 1);
  const onNext = () => go(current() + 1);
  prev?.addEventListener("click", onPrev);
  next?.addEventListener("click", onNext);
  const dotHandlers = dots.map((d, i) => {
    const h = () => go(i);
    d.addEventListener("click", h);
    return h;
  });
  let raf = 0;
  const onScroll = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(sync);
  };
  track.addEventListener("scroll", onScroll, { passive: true });
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    if (e.key === "ArrowLeft") onPrev();
    else onNext();
  };
  track.addEventListener("keydown", onKey);

  // Autoplay pauses on hover, on focus, in background tabs and for reduced motion.
  const interval = Number(root.dataset.autoplay ?? 0);
  let paused = false;
  const pause = () => (paused = true);
  const resume = () => (paused = false);
  root.addEventListener("pointerenter", pause);
  root.addEventListener("pointerleave", resume);
  root.addEventListener("focusin", pause);
  root.addEventListener("focusout", resume);
  const timer = interval >= 1000 && !reducedMotion() ? window.setInterval(() => !paused && !document.hidden && onNext(), interval) : 0;

  root.setAttribute("data-ready", "");
  sync();
  return () => {
    clearInterval(timer);
    cancelAnimationFrame(raf);
    prev?.removeEventListener("click", onPrev);
    next?.removeEventListener("click", onNext);
    dots.forEach((d, i) => d.removeEventListener("click", dotHandlers[i]));
    track.removeEventListener("scroll", onScroll);
    track.removeEventListener("keydown", onKey);
    root.removeEventListener("pointerenter", pause);
    root.removeEventListener("pointerleave", resume);
    root.removeEventListener("focusin", pause);
    root.removeEventListener("focusout", resume);
    root.removeAttribute("data-ready");
  };
}

/** Ticks a countdown every second. Without JS the widget shows the end date instead. */
function countdown(root: HTMLElement): () => void {
  const m = (root.dataset.target ?? "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return () => {};
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const end = root.dataset.tz === "UTC" ? Date.UTC(y, mo - 1, d, h, mi) : new Date(y, mo - 1, d, h, mi).getTime();
  const units = Array.from(root.querySelectorAll<HTMLElement>("[data-cd-unit]"));
  const hasDays = units.some((u) => u.dataset.cdUnit === "d");
  const pad = (n: number) => String(n).padStart(2, "0");
  const tick = () => {
    const left = Math.max(0, end - Date.now());
    let secs = Math.floor(left / 1000);
    const days = Math.floor(secs / 86400);
    if (hasDays) secs -= days * 86400;
    const values: Record<string, number> = { d: days, h: Math.floor(secs / 3600), m: Math.floor((secs % 3600) / 60), s: secs % 60 };
    for (const u of units) {
      const el = u.querySelector("[data-cd-num]");
      if (el) el.textContent = pad(values[u.dataset.cdUnit ?? "s"] ?? 0);
    }
    if (left <= 0) {
      root.setAttribute("data-done", "");
      clearInterval(timer);
    }
  };
  const timer = window.setInterval(tick, 1000);
  tick();
  root.setAttribute("data-ready", "");
  return () => clearInterval(timer);
}

/** Counts up from zero when the number scrolls into view. Without JS the final number is shown. */
function counter(root: HTMLElement): () => void {
  const el = root.querySelector<HTMLElement>("[data-count]");
  const to = Number(root.dataset.countTo);
  const seconds = Number(root.dataset.duration ?? 2);
  if (!el || !Number.isFinite(to) || seconds <= 0 || reducedMotion() || !("IntersectionObserver" in window)) return () => {};
  const decimals = Number(root.dataset.decimals ?? 0);
  const lang = root.closest<HTMLElement>("[lang]")?.lang || undefined;
  const format = (n: number) => n.toLocaleString(lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: root.hasAttribute("data-sep") });
  const final = el.textContent;
  let raf = 0;
  const run = () => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / (seconds * 1000));
      el.textContent = format(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
      else el.textContent = final;
    };
    raf = requestAnimationFrame(step);
  };
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      run();
    },
    { threshold: 0.4 },
  );
  io.observe(root);
  return () => {
    io.disconnect();
    cancelAnimationFrame(raf);
    el.textContent = final;
  };
}

function openLightbox(start: HTMLAnchorElement) {
  const group = Array.from(document.querySelectorAll<HTMLAnchorElement>(`a[data-lightbox="${CSS.escape(start.dataset.lightbox ?? "")}"]`));
  let index = Math.max(0, group.indexOf(start));

  document.querySelector("dialog.wb-lightbox")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "wb-lightbox";
  dialog.setAttribute("aria-label", "Image viewer");
  const img = document.createElement("img");
  const caption = document.createElement("p");
  const button = (label: string, text: string, attr: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.setAttribute(attr, "");
    b.textContent = text;
    return b;
  };
  const close = button("Close", "×", "data-lb-close");
  dialog.append(img, caption, close);
  const multi = group.length > 1;
  const prev = button("Previous image", "‹", "data-lb-prev");
  const next = button("Next image", "›", "data-lb-next");
  if (multi) dialog.append(prev, next);

  const show = (i: number) => {
    index = (i + group.length) % group.length;
    const a = group[index];
    const alt = a.querySelector("img")?.getAttribute("alt") ?? "";
    img.src = a.href;
    img.alt = alt;
    caption.textContent = [alt, multi ? `${index + 1} / ${group.length}` : ""].filter(Boolean).join(" · ");
  };
  const done = () => {
    dialog.close();
    dialog.remove();
    start.focus();
  };
  close.addEventListener("click", done);
  prev.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  dialog.addEventListener("click", (e) => e.target === dialog && done());
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    done();
  });
  dialog.addEventListener("keydown", (e) => {
    if (!multi) return;
    if (e.key === "ArrowLeft") show(index - 1);
    if (e.key === "ArrowRight") show(index + 1);
  });

  show(index);
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
}
