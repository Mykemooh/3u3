'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Drag (or use arrow keys) to wipe between the before and after photo of a
 * room. The after photo sits underneath; the before photo is clipped on top
 * to the handle's position.
 */
export default function BeforeAfter({ before, after, room }: { before: string; after: string; room: string }) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);

  const moveTo = useCallback((clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  }, []);

  return (
    <div
      ref={box}
      className="relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-2xl bg-ink"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        moveTo(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1 || e.pointerType === 'touch') moveTo(e.clientX);
      }}
    >
      <img src={after} alt={`${room} after cleaning`} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt={`${room} before cleaning`} className="h-full w-full object-cover" draggable={false} />
      </div>
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-ink/75 px-2.5 py-1 text-[11px] font-bold text-white">Before</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-gold px-2.5 py-1 text-[11px] font-bold text-ink">After</span>
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" />
      </div>
      <button
        type="button"
        role="slider"
        aria-label={`Compare ${room} before and after`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5));
          if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5));
        }}
        className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-gold text-ink shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        style={{ left: `${pos}%` }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
          <path d="m9 7-5 5 5 5M15 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
