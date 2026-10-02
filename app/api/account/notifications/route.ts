import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { eq } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';

const schema = z.object({ notificationChannel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']) });

// My Account → where reminders and alerts go. SMS/WhatsApp both need a
// phone on file; the UI (NotificationPreferences.tsx) disables those
// options otherwise, but this is re-checked here too.
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Pick a valid notification channel.' }, { status: 400 });
  const { notificationChannel } = parsed.data;

  if (notificationChannel !== 'EMAIL') {
    const client = (await db.select({ phone: users.phone }).from(users).where(eq(users.id, user.id)).limit(1))[0];
    if (!client?.phone) {
      return NextResponse.json({ error: 'Add a phone number to your account before choosing text or WhatsApp.' }, { status: 400 });
    }
  }

  await db.update(users).set({ notificationChannel }).where(eq(users.id, user.id));
  return NextResponse.json({ notificationChannel });
}
