import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { isTrustedDevice, mfaState, verifyMfaCode, TRUST_COOKIE } from '@/lib/mfa';
import { samePhone } from '@/lib/phone';

/** Google sign-in is offered only once its keys are set (Vercel → Environment Variables). */
export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const MAX_MFA_ATTEMPTS = 8;

type DbUser = typeof users.$inferSelect;

async function userByGoogle(sub: string | undefined, email: string | null | undefined): Promise<DbUser | undefined> {
  if (sub) {
    const bySub = (await db.select().from(users).where(eq(users.googleSub, sub)).limit(1))[0];
    if (bySub) return bySub;
  }
  if (email) {
    return (await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1))[0];
  }
  return undefined;
}

/**
 * Works out the MFA flags for a fresh sign-in:
 *   mfaPending — they have MFA and this browser isn't remembered: ask for a code.
 *   mfaSetup   — 'required' (their role needs it and it isn't set up yet) or
 *                'prompt' (offered once; they can say remind me later).
 */
async function mfaFlagsFor(userId: string) {
  const state = await mfaState(userId);
  let trusted = false;
  try {
    trusted = isTrustedDevice(cookies().get(TRUST_COOKIE)?.value, userId);
  } catch {
    trusted = false;
  }
  return {
    mfaPending: state.enabled && !trusted,
    mfaSetup: !state.enabled ? (state.required ? 'required' : state.shouldPrompt ? 'prompt' : undefined) : undefined,
  };
}

export const authOptions: AuthOptions = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/signin',
    error: '/signin',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        identifier: { label: 'Phone or email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) return null;
        const identifier = credentials.identifier.trim();

        // Exact first; then by digits, so "(713) 555-0601" finds "+17135550601".
        const byDigits = identifier.includes('@') ? null : samePhone(identifier);
        const byPhone = await db.select().from(users).where(eq(users.phone, identifier)).limit(1);
        const user =
          byPhone[0] ??
          (byDigits ? (await db.select().from(users).where(byDigits).limit(1))[0] : undefined) ??
          (await db.select().from(users).where(sql`lower(${users.email}) = ${identifier.toLowerCase()}`).limit(1))[0];

        if (!user || !user.passwordHash) return null;
        const valid = bcrypt.compareSync(credentials.password, user.passwordHash);
        if (!valid) return null;
        // A client the admin has closed can't sign in — their history stays
        // on file, but they can no longer book or manage their account.
        if (!user.isActive) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email ?? undefined,
          role: user.role,
          tenantId: user.tenantId,
        } as any;
      },
    }),
    ...(googleConfigured()
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: { params: { prompt: 'select_account' } },
          }),
        ]
      : []),
  ],
  callbacks: {
    /**
     * Google only signs in people who already have an account here (staff
     * invited by email, clients whose email is on file). It never creates
     * an account on its own — a stranger's Google login would otherwise
     * land in a company with no idea who they are.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'google') return true;
      const email = (profile?.email ?? user.email ?? '').toLowerCase();
      if (!email || (profile as { email_verified?: boolean } | undefined)?.email_verified === false) {
        return '/signin?error=GoogleEmail';
      }
      const row = await userByGoogle(account.providerAccountId, email);
      if (!row) return '/signin?error=NoAccount';
      if (!row.isActive) return '/signin?error=Closed';
      if (!row.googleSub) await db.update(users).set({ googleSub: account.providerAccountId }).where(eq(users.id, row.id));
      return true;
    },

    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        let row: { id: string; role: string; tenantId: string; name: string } | undefined;
        if (account?.provider === 'google') {
          row = await userByGoogle(account.providerAccountId, user.email);
        } else {
          row = { id: (user as any).id, role: (user as any).role, tenantId: (user as any).tenantId, name: user.name ?? '' };
        }
        if (row) {
          token.role = row.role;
          token.tenantId = row.tenantId;
          token.uid = row.id;
          token.name = row.name;
          const flags = await mfaFlagsFor(row.id);
          token.mfaPending = flags.mfaPending;
          token.mfaSetup = flags.mfaSetup;
          token.mfaAttempts = 0;
        }
      }

      if (trigger === 'update' && session && token.uid) {
        const uid = token.uid as string;
        // A code typed on /mfa. Checked here, on the server, so the browser
        // can't simply claim it passed.
        if (typeof session.mfaCode === 'string' && token.mfaPending) {
          const method = await verifyMfaCode(uid, session.mfaCode).catch(() => null);
          if (method) {
            token.mfaPending = false;
            token.mfaAttempts = 0;
          } else {
            token.mfaAttempts = ((token.mfaAttempts as number) ?? 0) + 1;
            if ((token.mfaAttempts as number) >= MAX_MFA_ATTEMPTS) token.mfaLocked = true;
          }
        }
        // After setup or "remind me later", re-read where they stand.
        if (session.mfaRefresh) {
          const state = await mfaState(uid);
          token.mfaSetup = !state.enabled ? (state.required ? 'required' : state.shouldPrompt ? 'prompt' : undefined) : undefined;
          // Finishing setup means they just proved a code — not pending.
          if (state.enabled && !token.mfaPending) token.mfaPending = false;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).tenantId = token.tenantId;
        (session.user as any).id = token.uid;
        (session.user as any).mfaPending = !!token.mfaPending;
        (session.user as any).mfaSetup = token.mfaSetup ?? null;
        (session.user as any).mfaLocked = !!token.mfaLocked;
      }
      return session;
    },
  },
};
