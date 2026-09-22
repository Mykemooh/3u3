import fs from 'fs';
import path from 'path';

/**
 * The hero backdrop, on a white page.
 *
 * There is no hero film yet. Rather than ship a placeholder or leave a
 * black rectangle, this checks at build time whether public/videos/hero.mp4
 * exists: drop the finished film in at that path, redeploy, and the
 * backdrop turns on with no code change. Until then the hero is a clean
 * white composition that looks deliberate rather than unfinished.
 *
 * When the film does arrive it sits under a white veil, not a dark one —
 * the page stays light, the footage reads as a soft moving texture behind
 * it, and the ink-on-white type keeps its contrast. `poster` means the
 * first paint is an image, so a phone on a weak connection never shows an
 * empty box; `preload="none"` keeps the video off the critical path
 * entirely.
 */
const VIDEO_PATH = 'videos/hero.mp4';
const POSTER_PATH = 'videos/hero-poster.jpg';

function publicFileExists(rel: string) {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', rel));
  } catch {
    return false;
  }
}

export default function HeroMedia() {
  const hasVideo = publicFileExists(VIDEO_PATH);
  const hasPoster = publicFileExists(POSTER_PATH);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-white">
      {hasVideo && (
        <video
          className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          poster={hasPoster ? `/${POSTER_PATH}` : undefined}
          src={`/${VIDEO_PATH}`}
        />
      )}

      {/* A white veil over the footage keeps the page light and the ink
          type readable, instead of the dark scrim a light-on-dark hero
          would need. Slightly heavier at the centre, where the words are. */}
      {hasVideo && <div className="absolute inset-0 bg-white/70" />}
      {hasVideo && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 45%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.72) 45%, rgba(255,255,255,0.5) 100%)',
          }}
        />
      )}

      {/* Without footage: a quiet warm wash so the hero still has depth. */}
      {!hasVideo && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 18% 12%, rgba(210,150,30,0.10), transparent 55%), radial-gradient(ellipse at 84% 78%, rgba(138,109,29,0.08), transparent 55%)',
          }}
        />
      )}

      {/* Softens the seam into whatever section follows. */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white" />
    </div>
  );
}
