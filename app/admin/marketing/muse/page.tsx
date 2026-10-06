import MuseStudio from '@/components/admin/MuseStudio';

export const dynamic = 'force-dynamic';

export default function MusePage({ searchParams }: { searchParams: { connected?: string; error?: string } }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Muse</h2>
        <p className="max-w-2xl text-slate">
          Tex’s marketing helper. Tell it a goal and it drafts ads and campaigns from your own services, clients and season. You edit and approve; nothing is sent, posted or spent until you say so, and Facebook ads are created paused.
        </p>
      </div>
      {searchParams.connected && <p className="card !p-3 text-sm text-green" role="status">Facebook connected. Pick the ad account and page below.</p>}
      {searchParams.error && <p className="card !p-3 text-sm text-red-600" role="alert">{searchParams.error}</p>}
      <MuseStudio />
    </div>
  );
}
