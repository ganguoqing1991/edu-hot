import { useEffect, useState } from "react";
import { Presence } from "../../components/ui/Presence";
import type { MediaView } from "@aihot/contracts/site";
import { IconClose } from "../../components/icons";

/** A round play mark over a video's still. */
function PlayMark() {
  return (
    <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
      <span className="grid size-11 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/30 backdrop-blur-sm transition-transform duration-200 group-hover:scale-105">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
          <path d="M7 4.5v15a1 1 0 001.5.87l13-7.5a1 1 0 000-1.74l-13-7.5A1 1 0 007 4.5z" />
        </svg>
      </span>
    </span>
  );
}

/**
 * The post's pictures as tiles. Images open in a viewer on the page; videos are only a still in our
 * data, so they open the original post to play.
 */
export function MediaGallery({ media, postUrl }: { media: MediaView[]; postUrl: string }) {
  const [open, setOpen] = useState<MediaView | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const shown = media.slice(0, 4);
  const single = shown.length === 1;
  const tile = `group relative overflow-hidden rounded-tile border border-line-soft bg-bg-sunk ${single ? "max-w-[420px]" : "aspect-[16/10]"}`;
  return (
    <>
      <div className={`mt-5 grid gap-2 ${single ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
        {shown.map((m) => {
          const img = (
            <img
              src={m.poster ?? m.url}
              srcSet={m.srcSet}
              sizes={single ? "auto, (min-width: 460px) 420px, calc(100vw - 32px)" : "auto, (min-width: 800px) 248px, (min-width: 640px) calc(33.333vw - 19px), calc(50vw - 24px)"}
              width={m.width ?? undefined}
              height={m.height ?? undefined}
              decoding="async"
              alt={m.alt ?? ""}
              loading="lazy"
              className={`block w-full object-cover transition-transform duration-300 group-hover:scale-[1.015] ${single ? "max-h-[360px]" : "h-full"}`}
              style={single && m.width && m.height ? { aspectRatio: `${m.width} / ${m.height}` } : undefined}
            />
          );
          return m.kind === "video" ? (
            <a key={m.url} href={postUrl} target="_blank" rel="noopener noreferrer" aria-label="打开原推播放视频" className={tile}>
              {img}
              <PlayMark />
            </a>
          ) : (
            <button key={m.url} type="button" onClick={() => setOpen(m)} aria-label={m.alt ? `查看大图：${m.alt}` : "查看大图"} className={`${tile} cursor-zoom-in`}>
              {img}
            </button>
          );
        })}
      </div>
      <Presence show={!!open} enter="anim-fade-in" exit="anim-fade-out" duration={160}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="图片"
            onClick={() => setOpen(null)}
            className="fixed inset-0 z-[80] grid cursor-zoom-out place-items-center bg-black/85 p-4 sm:p-10"
          >
            <img
              src={open?.url}
              decoding="async"
              alt={open?.alt ?? ""}
              className="lightbox-img anim-zoom-in max-h-full max-w-full rounded-control object-contain shadow-2xl"
            />
            <button type="button" aria-label="关闭" onClick={() => setOpen(null)} className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20">
              <IconClose size={18} />
            </button>
          </div>
      </Presence>
    </>
  );
}
