import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'TRASHCAN — The operating system for cleaning businesses', template: '%s · TRASHCAN' },
  description:
    'Book jobs, run your crews, get paid and keep every client in one place. Free to start, no per-seat fees, and an AI receptionist included. Built by a cleaning company in Katy, Texas.',
  icons: { icon: '/brand/trashcan/app-icon.svg', apple: '/brand/trashcan/app-icon.svg' },
  openGraph: {
    title: 'TRASHCAN — Cleaning business, cleaned up.',
    description: 'The all-in-one CRM and operations platform for cleaning businesses.',
    siteName: 'TRASHCAN',
  },
};

export default function TrashCanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
