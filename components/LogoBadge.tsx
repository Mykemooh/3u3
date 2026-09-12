import Logo from '@/components/Logo';

export default function LogoBadge({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="inline-flex items-center justify-center rounded-2xl bg-ink px-5 py-3 shadow-sm">
      <Logo size={size} />
    </div>
  );
}
