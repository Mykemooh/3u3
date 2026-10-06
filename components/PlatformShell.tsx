import TcSite from '@/components/tc/TcSite';

/**
 * TrashCan's own pages outside the marketing site (signup, terms, privacy,
 * status) — the same header, footer and theme as the marketing pages, so
 * every TrashCan page shares one structure.
 */
export default function PlatformShell({
  children,
  minimal = false,
  footer = true,
  className = 'bg-tc-50',
}: {
  children: React.ReactNode;
  minimal?: boolean;
  footer?: boolean;
  className?: string;
}) {
  return (
    <TcSite minimal={minimal} footer={footer} className={className}>
      {children}
    </TcSite>
  );
}
