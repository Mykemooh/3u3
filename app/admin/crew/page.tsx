import { redirect } from 'next/navigation';

// "Crew & Schedule" became the Team page (teams, roles, and each team's
// hours). Kept as a redirect so old links and bookmarks still land.
export default function AdminCrewPage() {
  redirect('/admin/team');
}
