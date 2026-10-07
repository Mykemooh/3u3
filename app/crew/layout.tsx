import type { Metadata, Viewport } from 'next';

/**
 * The cleaner app installs to a phone's home screen as "TrashCan Crew"
 * (public/crew.webmanifest): its own icon, full screen, opening on /crew.
 * Cleaners are sent here from trashcancleaning.app (next.config.js).
 */
export const metadata: Metadata = {
  title: 'TrashCan Crew',
  manifest: '/crew.webmanifest',
  icons: { apple: '/brand/trashcan/crew/icon-180.png' },
  appleWebApp: { capable: true, title: 'TrashCan Crew', statusBarStyle: 'black' },
};

export const viewport: Viewport = { themeColor: '#0B0F14' };

export default function CrewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
