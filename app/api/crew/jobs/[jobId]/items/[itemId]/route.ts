import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { addMedia, requireOpenItem, setSkip, viewerFrom, JobError } from '@/lib/jobs';
import { apiError } from '@/lib/api';
import { effectiveMaxBytes, isAllowedType, mediaKey, saveServerUpload } from '@/lib/storage';

/**
 * Skip / un-skip a room (with a reason), plus the original single-photo
 * upload kept for any crew phone still running the previous version of the
 * page. New uploads go through ./media.
 */
export async function POST(req: Request, { params }: { params: { jobId: string; itemId: string } }) {
  try {
    const viewer = viewerFrom(await getServerSession(authOptions));
    const form = await req.formData();
    const kind = form.get('kind') as string; // 'skip' | 'unskip' | 'before' | 'after'

    if (kind === 'skip') {
      const reason = String(form.get('skipReason') || '').trim();
      if (!reason) throw new JobError('Add a short reason for skipping this room.');
      return NextResponse.json({ item: await setSkip(params.jobId, params.itemId, viewer, reason) });
    }
    if (kind === 'unskip') {
      return NextResponse.json({ item: await setSkip(params.jobId, params.itemId, viewer, null) });
    }
    if (kind === 'before' || kind === 'after') {
      const { item } = await requireOpenItem(params.jobId, params.itemId, viewer);
      const file = form.get('file');
      if (!(file instanceof File)) throw new JobError('Photo required');
      if (!isAllowedType('PHOTO', file.type)) throw new JobError("That file type isn't supported.");
      if (file.size > effectiveMaxBytes('PHOTO')) throw new JobError('That photo is too large.', 413);
      const phase = kind === 'before' ? 'BEFORE' : 'AFTER';
      const key = mediaKey(params.jobId, item.id, phase, 'PHOTO', file.type);
      const url = await saveServerUpload(file, key);
      const result = await addMedia({
        jobId: params.jobId,
        itemId: item.id,
        phase,
        kind: 'PHOTO',
        url,
        storageKey: key,
        contentType: file.type,
        sizeBytes: file.size,
        durationSeconds: null,
        uploadedBy: viewer!.id,
      });
      return NextResponse.json({ item: result.item });
    }
    throw new JobError('Unknown action');
  } catch (err) {
    return apiError(err);
  }
}
