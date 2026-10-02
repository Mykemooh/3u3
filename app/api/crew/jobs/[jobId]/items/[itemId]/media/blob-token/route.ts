import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { authOptions } from '@/lib/auth';
import { requireOpenItem, countMedia, viewerFrom } from '@/lib/jobs';
import { MEDIA_LIMITS, allowedTypesFor, maxBytesFor, storageMode, type MediaKind, type MediaPhase } from '@/lib/storage';

/**
 * Issues a short-lived Vercel Blob client-upload token — the phone then
 * PUTs the file straight to Blob storage, never through this (or any)
 * Vercel function, so a video isn't bounded by the ~4.5 MB function body
 * limit. Same purpose as createDirectUpload()/the R2 presigned URL in
 * lib/storage.ts, just Blob's own equivalent mechanism. Mirrors the
 * existing sign/commit shape: the browser calls this for a token, then
 * explicitly commits via POST .../media { action: "commit-blob" } once
 * the upload finishes — not Blob's onUploadCompleted webhook, which
 * can't reach a local dev server and would make this impossible to test
 * outside of a live deployment.
 */
export async function POST(req: Request, { params }: { params: { jobId: string; itemId: string } }) {
  if (storageMode() !== 'blob') {
    return NextResponse.json({ error: 'Direct blob uploads are not enabled' }, { status: 400 });
  }
  const viewer = viewerFrom(await getServerSession(authOptions));
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayloadRaw) => {
        const clientPayload = JSON.parse(clientPayloadRaw || '{}') as { phase?: MediaPhase; kind?: MediaKind };
        if (clientPayload.phase !== 'BEFORE' && clientPayload.phase !== 'AFTER') throw new Error('phase must be BEFORE or AFTER');
        if (clientPayload.kind !== 'PHOTO' && clientPayload.kind !== 'VIDEO') throw new Error('kind must be PHOTO or VIDEO');

        const { item } = await requireOpenItem(params.jobId, params.itemId, viewer);
        if ((await countMedia(item.id, clientPayload.phase)) >= MEDIA_LIMITS.perPhase) {
          throw new Error(`That's the limit of ${MEDIA_LIMITS.perPhase} files for this room. Remove one to add another.`);
        }

        return {
          allowedContentTypes: allowedTypesFor(clientPayload.kind),
          maximumSizeInBytes: maxBytesFor(clientPayload.kind),
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not start that upload.' }, { status: 400 });
  }
}
