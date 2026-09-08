// Text-based wordmark standing in for the supplied 3U3 logo PNG.
// Drop the real asset at /public/logo.png and swap the markup below for an
// <img src="/logo.png" /> when it's available — this keeps the same
// layout/proportions (numerals + gold U + "CLEANING" + tagline).
export default function Logo({
  variant = 'dark',
  size = 'md',
}: {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
}) {
  // variant="light" = light-colored wordmark, for use on dark backgrounds.
  // variant="dark" = dark-colored wordmark, for use on light backgrounds.
  const isLightText = variant === 'light';
  const sizes = {
    sm: { num: 'text-2xl', tag: 'text-[10px]' },
    md: { num: 'text-4xl', tag: 'text-xs' },
    lg: { num: 'text-6xl', tag: 'text-sm' },
  }[size];

  return (
    <div className={`inline-flex flex-col items-center ${isLightText ? 'text-white' : 'text-ink'}`}>
      <div className={`font-black tracking-tight ${sizes.num} leading-none`}>
        3<span className="text-gold">U</span>3
      </div>
      <div className={`font-semibold tracking-[0.35em] ${sizes.tag} mt-1 ${isLightText ? 'text-white/90' : 'text-ink/80'}`}>
        CLEANING
      </div>
    </div>
  );
}
