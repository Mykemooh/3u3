import type { Metadata } from 'next';
import PlatformShell from '@/components/PlatformShell';
import SignupFlow from '@/components/signup/SignupFlow';
import { signupIsOpen, SIGNUP_QUESTIONS } from '@/lib/signup';
import type { PlanKey } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Get started free · TRASHCAN',
  description: 'Set up your cleaning company on TRASHCAN in about fifteen minutes. Free to start, no card.',
  icons: { icon: '/brand/trashcan/app-icon.svg' },
};

export default async function StartPage({ searchParams }: { searchParams: { plan?: string } }) {
  const open = await signupIsOpen();
  const wanted = (searchParams.plan ?? '').toUpperCase();
  const initialPlan: PlanKey = wanted === 'CREW' || wanted === 'TEAM' ? wanted : 'FREE';
  return (
    <PlatformShell minimal footer={false} className="bg-white">
      <SignupFlow open={open} questions={SIGNUP_QUESTIONS} initialPlan={initialPlan} />
    </PlatformShell>
  );
}
