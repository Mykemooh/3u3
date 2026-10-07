import AuthLocaleFrame from '@/components/AuthLocaleFrame';

// Reads the language cookie / session for this request.
export const dynamic = 'force-dynamic';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthLocaleFrame>{children}</AuthLocaleFrame>;
}
