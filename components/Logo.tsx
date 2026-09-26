const SIZES = {
  sm: 'text-2xl',
  md: 'text-4xl',
  lg: 'text-6xl',
};

/**
 * The 3U3 wordmark: bold navy numerals with the U in a blue-to-green
 * gradient. Built as real text (not an image) so it reads crisply on light
 * and dark backgrounds alike at any size — `variant` picks which.
 */
export default function Logo({
  variant = 'dark',
  size = 'md',
  className = '',
}: {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const numeralColor = variant === 'light' ? 'text-white' : 'text-ink';
  return (
    <span className={`inline-flex select-none items-baseline font-black tracking-tight ${SIZES[size]} ${className}`}>
      <span className={numeralColor}>3</span>
      <span className="bg-gradient-to-br from-gold to-green-light bg-clip-text text-transparent">U</span>
      <span className={numeralColor}>3</span>
    </span>
  );
}
