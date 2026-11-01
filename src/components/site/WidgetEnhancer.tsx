"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for interactive widgets on the live site. The
 * widgets are server-rendered HTML that already works without JavaScript (a
 * lightbox link opens the image itself); this adds the nicer behaviour on
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
    return () => {
      document.removeEventListener("click", onClick);
      document.querySelector("dialog.wb-lightbox")?.remove();
    };
  }, []);
  return null;
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
