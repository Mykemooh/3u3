import { getServerSession } from 'next-auth';
import { redirect, notFound } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { addresses } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getJobById, getBookingById, getUserById, getServiceType, getChecklistItemsForJob, getCrewForUser, SERVICE_LABELS } from '@/lib/data';
import JobChecklist from '@/components/JobChecklist';

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/signin?role=crew');
  const role = (session.user as any).role;
  const userId = (session.user as any).id as string;

  const job = await getJobById(params.id);
  if (!job) notFound();

  if (role === 'CLEANER') {
    const crew = await getCrewForUser(userId);
    if (!crew || crew.id !== job.crewId) {
      // Cleaners see only their own assigned jobs (PRD section 8).
      redirect('/crew');
    }
  } else if (role !== 'ADMIN') {
    redirect('/signin?role=crew');
  }

  const booking = await getBookingById(job.bookingId);
  if (!booking) notFound();
  const client = await getUserById(booking.clientId);
  const service = booking.serviceTypeId ? await getServiceType(booking.serviceTypeId) : null;
  const address = booking.addressId
    ? (await db.select().from(addresses).where(eq(addresses.id, booking.addressId)).limit(1))[0]
    : null;
  const items = await getChecklistItemsForJob(job.id);

  return (
    <JobChecklist
      job={job}
      client={client}
      serviceLabel={service ? SERVICE_LABELS[service.key] : 'Service'}
      address={address}
      slotStart={booking.slotStart}
      items={items}
    />
  );
}
