import { redirect } from 'next/navigation';

/** Billing moved into the workspace: Settings → Plan & credits. */
export default function BillingPage() {
  redirect('/admin/plan');
}
