import Logo from '@/components/Logo';

// The wordmark now reads fine directly on white — no dark pill needed to
// carry it, unlike the old dark-background-only raster asset.
export default function LogoBadge({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <Logo size={size} />;
}
