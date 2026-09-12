const SPARKLES = [
  { left: '18%', delay: '0s', duration: '3.2s', size: 6 },
  { left: '32%', delay: '0.8s', duration: '2.6s', size: 4 },
  { left: '47%', delay: '1.6s', duration: '3.6s', size: 5 },
  { left: '61%', delay: '0.4s', duration: '2.8s', size: 4 },
  { left: '73%', delay: '2.2s', duration: '3s', size: 6 },
  { left: '85%', delay: '1.2s', duration: '2.4s', size: 3 },
];

// Stand-in for a real looping cleaning video (per the PRD's "looping
// background video" spec): no footage asset exists yet, so this simulates
// motion with a sweeping shine + rising sparkles instead of a static image.
// Swap for a <video autoPlay loop muted playsInline> once real footage
// (e.g. a cloth wiping a countertop) is available — same absolute layer.
export default function CleaningMotion() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="animate-shine-sweep absolute -inset-y-1/2 left-1/2 h-[200%] w-1/3 -translate-x-1/2"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(228,180,88,0.5), transparent)',
        }}
      />
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="animate-sparkle absolute bottom-1/3 rounded-full bg-gold shadow-gold"
          style={{
            left: s.left,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
            animationDuration: s.duration,
          }}
        />
      ))}
    </div>
  );
}
