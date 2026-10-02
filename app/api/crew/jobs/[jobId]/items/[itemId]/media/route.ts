import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { addMedia, countMedia, requireOpenItem, viewerFrom, JobError } from '@/lib/jobs';
import { apiError } from '@/lib/api';
import {
  MEDIA_LIMITS,
  createDirectUpload,
  effectiveMaxBytes,
  maxBytesFor,
  isAllowedType,
  keyBelongsTo,
  mediaKey,
  publicUrlForKey,
  saveServerUpload,
  statDirectUpload,
  storageMode,
  deleteStored,
  type MediaKind,
  type MediaPhase,
} from '@/lib/storage';

/**
 * Adding a photo or video to a room. Two paths, same rules:
 *
 *  With R2 configured (production):
 *    1. POST { action: "sign", phase, kind, contentType, size }
 *       → { mode: "direct", key, uploadUrl }  — the phone PUTs the file there
 *    2. POST { action: "commit", key, phase, kind, durationSeconds }
 *       → the server checks what actually landed in R2, then records it.
 *
 *  Without R2 (Vercel Blob, or local dev):
 *    1. "sign" answers { mode: "server", maxBytes }
 *    2. POST multipart/form-data { file, phase, kind, durationSeconds }
 */

const PHASES: MediaPhase[] = ['BEFORE', 'AFTER'];
const KINDS: MediaKind[] = ['PHOTO', 'VIDEO'];

function parseCommon(phase: unknown, kind: unknown) {
  if (!PHASES.includes(phase as MediaPhase)) throw new JobError('phase must be BEFORE or AFTER');
  if (!KINDS.includes(kind as MediaKind)) throw new JobError('kind must be PHOTO or VIDEO');
  return { phase: phase as MediaPhase, kind: kind as MediaKind };
}

function checkDuration(kind: MediaKind, durationSeconds: unknown) {
  const d = typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) ? durationSeconds : null;
  if (kind === 'VIDEO' && d != null && d > MEDIA_LIMITS.videoSeconds + 1) {
    throw new JobError(`Videos can be up to ${MEDIA_LIMITS.videoSeconds} seconds. Trim it or record a shorter one.`);
  }
  return d;
}

function tooBig(kind: MediaKind, max: number) {
  const mb = Math.floor(max / (1024 * 1024));
  return new JobError(
    kind === 'VIDEO' ? `That video is over ${mb} MB. Record a shorter clip, or set the camera to 720p.` : `That photo is over ${mb} MB.`,
    413,
  );
}

export async function POST(req: Request, { params }: { params: { jobId: string; itemId: string } }) {
  try {
    const viewer = viewerFrom(await getServerSession(authOptions));
    const { item } = await requireOpenItem(params.jobId, params.itemId, viewer);
    const contentTypeHeader = req.headers.get('content-type') || '';

    // ---- Server path: the file itself is in the request ---------------
    if (contentTypeHeader.startsWith('multipart/form-data')) {
      const form = await req.formData();
      const { phase, kind } = parseCommon(form.get('phase'), form.get('kind'));
      const duration = checkDuration(kind, form.get('durationSeconds') ? Number(form.get('durationSeconds')) : null);
      const file = form.get('file');
      if (!(file instanceof File) || file.size === 0) throw new JobError('No file received');
      if (!isAllowedType(kind, file.type)) throw new JobError(`That file type (${file.type || 'unknown'}) isn't supported.`);
      const max = effectiveMaxBytes(kind);
      if (file.size > max) throw tooBig(kind, max);
      if ((await countMedia(item.id, phase)) >= MEDIA_LIMITS.perPhase) {
        throw new JobError(`That's the limit of ${MEDIA_LIMITS.perPhase} files for this room.`, 409);
      }
      const key = mediaKey(params.jobId, item.id, phase, kind, file.type);
      const url = await saveServerUpload(file, key);
      const result = await addMedia({
        jobId: params.jobId,
        itemId: item.id,
        phase,
        kind,
        url,
        storageKey: key,
        contentType: file.type,
        sizeBytes: file.size,
        durationSeconds: duration,
        uploadedBy: viewer!.id,
      });
      return NextResponse.json(result);
    }

    // ---- Direct path: sign, then commit --------------------------------
    const body = await req.json().catch(() => ({}));
    const { phase, kind } = parseCommon(body.phase, body.kind);

    if (body.action === 'sign') {
      // Videos on Blob storage use their own client-upload token flow
      // (blob-token/route.ts) — straight from the phone to Blob, bypassing
      // the ~4.5 MB Vercel function body limit, the same reason R2 uses a
      // presigned URL instead of posting the file here. Photos are small
      // enough (the browser already shrinks them) to keep using the
      // simpler server-upload path even on Blob.
      if (storageMode() === 'blob' && kind === 'VIDEO') {
        return NextResponse.json({ mode: 'blob-direct', maxBytes: maxBytesFor(kind) });
      }
      if (storageMode() !== 'r2') {
        return NextResponse.json({ mode: 'server', maxBytes: effectiveMaxBytes(kind) });
      }
      const contentType = String(body.contentType || '');
      if (!isAllowedType(kind, contentType)) throw new JobError(`That file type (${contentType || 'unknown'}) isn't supported.`);
      const max = effectiveMaxBytes(kind);
      if (Number(body.size) > max) throw tooBig(kind, max);
      if ((await countMedia(item.id, phase)) >= MEDIA_LIMITS.perPhase) {
        throw new JobError(`That's the limit of ${MEDIA_LIMITS.perPhase} files for this room.`, 409);
      }
      const key = mediaKey(params.jobId, item.id, phase, kind, contentType);
      const { uploadUrl } = createDirectUpload(key);
      return NextResponse.json({ mode: 'direct', key, uploadUrl, maxBytes: max });
    }

    if (body.action === 'commit') {
      if (storageMode() !== 'r2') throw new JobError('Direct uploads are not enabled');
      const key = String(body.key || '');
      if (!keyBelongsTo(key, params.jobId, item.id, kind)) throw new JobError('That upload does not belong to this room', 403);
      const duration = checkDuration(kind, body.durationSeconds);
      const stat = await statDirectUpload(key);
      if (!stat) throw new JobError('The upload did not finish. Please try again.', 409);
      const url = publicUrlForKey(key);
      const max = effectiveMaxBytes(kind);
      if (stat.size > max || (stat.contentType && !isAllowedType(kind, stat.contentType))) {
        await deleteStored({ key, url });
        throw stat.size > max ? tooBig(kind, max) : new JobError("That file type isn't supported.");
      }
      const result = await addMedia({
        jobId: params.jobId,
        itemId: item.id,
        phase,
        kind,
        url,
        storageKey: key,
        contentType: stat.contentType || null,
        sizeBytes: stat.size,
        durationSeconds: duration,
        uploadedBy: viewer!.id,
      });
      return NextResponse.json(result);
    }

    // ---- Blob-direct path: the phone already PUT the file straight to
    // Vercel Blob (lib/clientUpload.ts, via a token from blob-token/
    // route.ts); this just verifies what actually landed there and
    // records it — same spirit as the R2 "commit" above, using Blob's
    // own head() instead of statDirectUpload(). ------------------------
    if (body.action === 'commit-blob') {
      if (storageMode() !== 'blob') throw new JobError('Direct blob uploads are not enabled');
      const url = String(body.url || '');
      if (!url.startsWith('https://') || !/blob\.vercel-storage\.com/.test(url)) {
        throw new JobError('That upload does not look right', 403);
      }
      const duration = checkDuration(kind, body.durationSeconds);
      const { head } = await import('@vercel/blob');
      let stat: { size: number; contentType: string | null };
      try {
        const info = await head(url);
        stat = { size: info.size, contentType: info.contentType ?? null };
      } catch {
        throw new JobError('The upload did not finish. Please try again.', 409);
      }
      const max = maxBytesFor(kind);
      if (stat.size > max || (stat.contentType && !isAllowedType(kind, stat.contentType))) {
        await deleteStored({ url });
        throw stat.size > max ? tooBig(kind, max) : new JobError("That file type isn't supported.");
      }
      if ((await countMedia(item.id, phase)) >= MEDIA_LIMITS.perPhase) {
        await deleteStored({ url });
        throw new JobError(`That's the limit of ${MEDIA_LIMITS.perPhase} files for this room.`, 409);
      }
      const result = await addMedia({
        jobId: params.jobId,
        itemId: item.id,
        phase,
        kind,
        url,
        storageKey: null,
        contentType: stat.contentType,
        sizeBytes: stat.size,
        durationSeconds: duration,
        uploadedBy: viewer!.id,
      });
      return NextResponse.json(result);
    }

    throw new JobError('Unknown action');
  } catch (err) {
    return apiError(err);
  }
}
