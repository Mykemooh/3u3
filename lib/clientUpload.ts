'use client';

/**
 * Browser-side half of media uploads (see app/api/.../media/route.ts).
 *
 * Photos are shrunk on the phone before upload: longest side 1600 px, JPEG
 * at 82% quality. A 4 MB phone photo becomes roughly 300 KB and still looks
 * sharp full-screen on any phone. That is most of what keeps a busy month
 * of jobs inside the free storage tier.
 */

export type Phase = 'BEFORE' | 'AFTER';
export type Kind = 'PHOTO' | 'VIDEO';

const MAX_EDGE = 1600;
const QUALITY = 0.82;

// Matches lib/time.ts's BUSINESS_TIMEZONE default — duplicated rather
// than imported, since this runs in the browser bundle where a
// non-NEXT_PUBLIC_ env var always reads as undefined, which would
// silently show the fallback anyway while looking like it respected a
// server-side override.
const DISPLAY_TIMEZONE = 'America/Chicago';

/** Burns a timestamp into the photo itself, bottom-right — proof of when it was actually taken that travels with the file, not just a DB column. */
function drawTimestamp(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const label = new Date().toLocaleString('en-US', {
    timeZone: DISPLAY_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const fontSize = Math.max(14, Math.round(w * 0.022));
  ctx.font = `${fontSize}px sans-serif`;
  const paddingX = Math.round(fontSize * 0.5);
  const paddingY = Math.round(fontSize * 0.35);
  const textWidth = ctx.measureText(label).width;
  const boxW = textWidth + paddingX * 2;
  const boxH = fontSize + paddingY * 2;
  const margin = Math.round(fontSize * 0.6);
  const x = w - boxW - margin;
  const y = h - boxH - margin;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + paddingX, y + boxH / 2);
}

export async function compressPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    drawTimestamp(ctx, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    // Unlike before, the canvas pass (burning in the timestamp) is now
    // always meaningful even when it doesn't shrink the file — so unlike
    // the old "keep the original if we didn't do better" check, the
    // stamped version is kept whenever the canvas pass succeeded at all.
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Reads a video's length without uploading it. Null if the browser can't tell. */
export function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    const timer = setTimeout(() => done(null), 6000);
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    v.src = url;
  });
}

function xhr(method: string, url: string, body: Document | XMLHttpRequestBodyInit, headers: Record<string, string>, onProgress?: (p: number) => void) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open(method, url);
    for (const [k, v] of Object.entries(headers)) req.setRequestHeader(k, v);
    if (onProgress) req.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    req.onload = () => resolve({ status: req.status, text: req.responseText });
    req.onerror = () => reject(new Error('Network error — check your signal and try again.'));
    req.send(body);
  });
}

async function readJson(res: Response | { status: number; text: string }) {
  const text = 'text' in res && typeof res.text === 'string' ? res.text : await (res as Response).text();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function uploadMedia(input: {
  jobId: string;
  itemId: string;
  phase: Phase;
  kind: Kind;
  file: File;
  onProgress?: (fraction: number) => void;
}) {
  const { jobId, itemId, phase, kind } = input;
  const endpoint = `/api/crew/jobs/${jobId}/items/${itemId}/media`;

  let body: Blob = input.file;
  let durationSeconds: number | null = null;
  if (kind === 'PHOTO') body = await compressPhoto(input.file);
  if (kind === 'VIDEO') durationSeconds = await videoDuration(input.file);
  const contentType = body.type || (kind === 'PHOTO' ? 'image/jpeg' : 'video/mp4');

  const signRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sign', phase, kind, contentType, size: body.size }),
  });
  const sign = await readJson(signRes);
  if (!signRes.ok) throw new Error(sign.error || 'Could not start the upload.');

  if (sign.mode === 'direct') {
    const put = await xhr('PUT', sign.uploadUrl, body, { 'Content-Type': contentType }, input.onProgress);
    if (put.status < 200 || put.status >= 300) throw new Error('Upload to storage failed. Please try again.');
    const commitRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'commit', key: sign.key, phase, kind, durationSeconds }),
    });
    const data = await readJson(commitRes);
    if (!commitRes.ok) throw new Error(data.error || 'Upload failed.');
    return data;
  }

  // Vercel Blob's own client-upload: the phone PUTs straight to Blob
  // storage with a short-lived token (blob-token/route.ts), bypassing the
  // ~4.5 MB Vercel function body limit the same way the R2 "direct" path
  // above does. Used for videos when Blob (not R2) is the active backend.
  if (sign.mode === 'blob-direct') {
    const { upload } = await import('@vercel/blob/client');
    const ext = contentType.split('/')[1] || 'bin';
    const pathname = `videos/${jobId}/${itemId}-${phase.toLowerCase()}-${Date.now()}.${ext}`;
    let blob: { url: string };
    try {
      blob = await upload(pathname, body, {
        access: 'public',
        handleUploadUrl: `${endpoint}/blob-token`,
        clientPayload: JSON.stringify({ phase, kind }),
        contentType,
        onUploadProgress: (p) => input.onProgress?.(p.percentage / 100),
      });
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Upload to storage failed. Please try again.');
    }
    const commitRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'commit-blob', url: blob.url, phase, kind, durationSeconds }),
    });
    const data = await readJson(commitRes);
    if (!commitRes.ok) throw new Error(data.error || 'Upload failed.');
    return data;
  }

  if (sign.maxBytes && body.size > sign.maxBytes) {
    const mb = Math.floor(sign.maxBytes / (1024 * 1024));
    throw new Error(
      kind === 'VIDEO'
        ? `Videos over ${mb} MB need cloud storage set up. Ask the office, and take photos for now.`
        : `That photo is over ${mb} MB.`,
    );
  }
  const ext = contentType.split('/')[1] || 'bin';
  const form = new FormData();
  form.append('phase', phase);
  form.append('kind', kind);
  if (durationSeconds != null) form.append('durationSeconds', String(durationSeconds));
  form.append('file', new File([body], `${kind.toLowerCase()}.${ext}`, { type: contentType }));
  const res = await xhr('POST', endpoint, form, {}, input.onProgress);
  const data = await readJson(res);
  if (res.status < 200 || res.status >= 300) throw new Error(data.error || 'Upload failed.');
  return data;
}
