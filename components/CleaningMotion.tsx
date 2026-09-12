// Real looping cleaning footage behind the hero's logo, tagline, and both
// CTAs ("Get a free quote" and "Already a customer? Sign in") — per the
// PRD's "looping background video" spec (section 6.1). Replaces the earlier
// CSS-simulated shine/sparkle stand-in now that real footage exists.
export default function CleaningMotion() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <video
        className="absolute inset-0 h-full w-full object-cover opacity-45"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        src="/videos/hero-cleaning.mp4"
      />
      {/* Scrim so the logo, tagline, and buttons stay readable over the footage */}
      <div className="absolute inset-0 bg-ink/70" />
    </div>
  );
}
