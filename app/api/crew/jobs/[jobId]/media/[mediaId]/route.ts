import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { removeMedia, viewerFrom } from '@/lib/jobs';
import { apiError } from '@/lib/api';

// Remove a photo or video (a blurry shot, the wrong room). Only while the
// job is still open — once finished, the record is what the client sees.
export async function DELETE(_req: Request, { params }: { params: { jobId: string; mediaId: string } }) {
  try {
    const result = await removeMedia(params.jobId, params.mediaId, viewerFrom(await getServerSession(authOptions)));
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
