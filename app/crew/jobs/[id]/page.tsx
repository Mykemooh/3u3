import { getServerSession } from 'next-auth';
import { redirect, notFound } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { homeForRole } from '@/lib/nav';
import { SERVICE_LABELS } from '@/lib/data';
import { loadJob, canWorkJob, canLead, viewerFrom } from '@/lib/jobs';
import { formatSlot, formatClock } from '@/lib/time';
import { formatSlotLabel } from '@/lib/scheduling';
import { MEDIA_LIMITS } from '@/lib/storage';
import AppShell, { CREW_TABS } from '@/components/app/AppShell';
import CrewJob from '@/components/CrewJob';
import { getHomeProfile, homeProfileHasContent } from '@/lib/homeProfile';

export const dynamic = 'force-dynamic';

export default async function CrewJobPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const viewer = viewerFrom(session);
  if (!viewer) redirect(`/signin?next=/crew/jobs/${params.id}`);

  const data = await loadJob(params.id);
  if (!data) notFound();
  // Cleaners see only their own crew's jobs; customers are sent home.
  if (!(await canWorkJob(viewer, data.job))) redirect(`${homeForRole(viewer.role)}?denied=1`);

  const { job, booking, client, service, address, items, media } = data;
  const isLead = await canLead(viewer, job);
  const whenLabel = `${formatSlot(booking.slotStart).split(' · ')[0]} · ${formatSlotLabel(booking.slotStart, booking.slotEnd)}`;
  // The viewer already passed canWorkJob above (assigned crew, or admin)
  // — that's the authorization boundary for decrypting the entry code.
  const homeProfile = address ? await getHomeProfile(address.id) : null;

  return (
    <AppShell name={session?.user?.name} tabs={CREW_TABS} homeHref={viewer.role === 'ADMIN' ? '/admin' : '/crew'}>
      <CrewJob
        job={{
          id: job.id,
          status: job.status,
          startedLabel: job.startedAt ? formatClock(job.startedAt) : null,
          completedLabel: job.completedAt ? formatClock(job.completedAt) : null,
          requireBeforePhoto: job.requireBeforePhoto,
          noPhotosNeeded: job.noPhotosNeeded,
          cleanerNotesAckAt: job.cleanerNotesAckAt ? job.cleanerNotesAckAt.toISOString() : null,
        }}
        client={{ name: client?.name ?? 'Client', phone: client?.phone ?? null }}
        serviceLabel={service ? SERVICE_LABELS[service.key] ?? service.name : 'Cleaning'}
        whenLabel={whenLabel}
        addressLabel={address ? `${address.line1}, ${address.city}, ${address.state}${address.zip ? ` ${address.zip}` : ''}` : null}
        cleanerNotes={address?.notes ?? null}
        homeProfile={
          homeProfile && homeProfileHasContent(homeProfile)
            ? {
                pets: homeProfile.pets,
                parkingNotes: homeProfile.parkingNotes,
                allergyNotes: homeProfile.allergyNotes,
                doNotTouch: homeProfile.doNotTouch,
                entryCode: homeProfile.entryCode,
                entryCodeSet: homeProfile.entryCodeSet,
                roomNotes: homeProfile.roomNotes,
              }
            : null
        }
        items={items.map((i) => ({ id: i.id, roomName: i.roomName, taskDetail: i.taskDetail, status: i.status, skipReason: i.skipReason }))}
        media={media.map((m) => ({ id: m.id, itemId: m.itemId, phase: m.phase, kind: m.kind, url: m.url, createdAt: m.createdAt.toISOString() }))}
        perPhase={MEDIA_LIMITS.perPhase}
        videoSeconds={MEDIA_LIMITS.videoSeconds}
        isAdmin={viewer.role === 'ADMIN'}
        canLead={isLead}
      />
    </AppShell>
  );
}
