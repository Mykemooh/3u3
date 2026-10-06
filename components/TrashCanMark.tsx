import TcLogo from '@/components/tc/TcLogo';

/**
 * The TRASHCAN lockup (lime icon + wordmark) for platform pages — never on
 * a company's own branded portals. `light` means it sits on a dark surface.
 */
export default function TrashCanMark({ className = '', light = false }: { className?: string; light?: boolean }) {
  return <TcLogo on={light ? 'dark' : 'light'} className={className} />;
}
