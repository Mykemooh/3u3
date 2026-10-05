import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadJob, canViewJob, viewerFrom } from '@/lib/jobs';
import { ensureProofToken } from '@/lib/proof';
import { appUrl } from '@/lib/url';

/** The shareable proof-of-clean link for a finished visit (client, crew or admin). */
export async function POST(_req: Request, { params }: { params: { jobId: string } }) {
  const viewer = viewerFrom(await getServerSession(authOptions));
  const data = await loadJob(params.jobId);
  if (!viewer || !data || !(await canViewJob(viewer, data.job, data.booking))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const token = await ensureProofToken(params.jobId);
  if (!token) return NextResponse.json({ error: 'The report is ready once the clean is finished.' }, { status: 409 });
  return NextResponse.json({ url: appUrl(`/proof/${token}`) });
}
