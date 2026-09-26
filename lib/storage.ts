import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Job photo & video storage.
 *
 * Three backends, picked automatically from the environment:
 *
 *  1. Cloudflare R2 (preferred) — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 *     R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL. 10 GB free every
 *     month with no charge for downloads (egress), versus roughly 1 GB on
 *     Vercel Blob's free tier. The phone uploads straight to R2 using a
 *     short-lived signed URL, so files never pass through a Vercel function.
 *     That matters: Vercel rejects any request body over ~4.5 MB, which a
 *     single full-resolution phone photo can exceed and every video does.
 *
 *  2. Vercel Blob — if only BLOB_READ_WRITE_TOKEN is set. Uploads go through
 *     the server, so they're capped at SERVER_UPLOAD_MAX_BYTES. Photos fit
 *     (the browser shrinks them first); videos generally don't.
 *
 *  3. Local disk under public/uploads — local development with neither set.
 *
 * Object keys are laid out by kind so clean-up can target them:
 *   photos/<jobId>/<itemId>-before-<random>.jpg
 *   videos/<jobId>/<itemId>-after-<random>.mp4
 */

export type MediaKind = 'PHOTO' | 'VIDEO';
export type MediaPhase = 'BEFORE' | 'AFTER';
export type StorageMode = 'r2' | 'blob' | 'local';

export const MEDIA_LIMITS = {
  /** Largest photo accepted after the browser has compressed it. */
  photoBytes: 8 * 1024 * 1024,
  /** Largest video accepted. About 30 s of 1080p phone video; 720p is far smaller. */
  videoBytes: 80 * 1024 * 1024,
  /** Longest video the crew app will accept, in seconds. */
  videoSeconds: 30,
  /** Photos plus videos per room, per phase (before / after). */
  perPhase: 6,
};

/** What a Vercel function will accept as a request body, with headroom. */
export const SERVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'];

function baseType(contentType: string) {
  return contentType.toLowerCase().split(';')[0].trim();
}

export function isAllowedType(kind: MediaKind, contentType: string) {
  return (kind === 'PHOTO' ? PHOTO_TYPES : VIDEO_TYPES).includes(baseType(contentType));
}

export function maxBytesFor(kind: MediaKind) {
  return kind === 'PHOTO' ? MEDIA_LIMITS.photoBytes : MEDIA_LIMITS.videoBytes;
}

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
};

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl: publicUrl.replace(/\/+$/, '') };
}

export function storageMode(): StorageMode {
  if (r2Config()) return 'r2';
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  return 'local';
}

/** Largest file the current backend can take, for a given kind. */
export function effectiveMaxBytes(kind: MediaKind) {
  const cap = maxBytesFor(kind);
  return storageMode() === 'blob' ? Math.min(cap, SERVER_UPLOAD_MAX_BYTES) : cap;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
};

export function mediaKey(jobId: string, itemId: string, phase: MediaPhase, kind: MediaKind, contentType: string) {
  const ext = EXT_BY_TYPE[baseType(contentType)] ?? (kind === 'PHOTO' ? 'jpg' : 'mp4');
  const rand = crypto.randomBytes(12).toString('hex');
  const folder = kind === 'VIDEO' ? 'videos' : 'photos';
  return `${folder}/${jobId}/${itemId}-${phase.toLowerCase()}-${rand}.${ext}`;
}

/** True only for a key this app would have minted for this job + room (blocks spoofed keys). */
export function keyBelongsTo(key: string, jobId: string, itemId: string, kind: MediaKind) {
  const parts = key.split('/');
  if (parts.length !== 3) return false;
  const [folder, job, file] = parts;
  return folder === (kind === 'VIDEO' ? 'videos' : 'photos') && job === jobId && file.startsWith(`${itemId}-`);
}

// ---------------------------------------------------------------------------
// AWS Signature Version 4, query-string ("presigned URL") form. R2 speaks the
// S3 API, so this is all that's needed — no SDK, no extra dependency.
// Checked against AWS's own published example by scripts/verify-sigv4.ts.
// ---------------------------------------------------------------------------

function rfc3986(str: string) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hmac(key: Buffer | string, data: string) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

export function presignUrl(input: {
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE';
  host: string;
  path: string; // e.g. /bucket/photos/abc.jpg — unencoded
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  expiresSeconds: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${input.region}/s3/aws4_request`;

  const canonicalUri = input.path
    .split('/')
    .map((seg) => rfc3986(seg))
    .join('/');

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${input.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(input.expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`)
    .join('&');

  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    `host:${input.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
  ].join('\n');

  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return `https://${input.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function r2Presign(cfg: R2Config, method: 'PUT' | 'HEAD' | 'DELETE', key: string, expiresSeconds = 600) {
  return presignUrl({
    method,
    host: `${cfg.accountId}.r2.cloudflarestorage.com`,
    path: `/${cfg.bucket}/${key}`,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    region: 'auto',
    expiresSeconds,
  });
}

export function publicUrlForKey(key: string) {
  const cfg = r2Config();
  if (!cfg) throw new Error('R2 is not configured');
  return `${cfg.publicUrl}/${key.split('/').map(rfc3986).join('/')}`;
}

/** A URL the phone can PUT the file to directly, valid for 10 minutes. */
export function createDirectUpload(key: string) {
  const cfg = r2Config();
  if (!cfg) throw new Error('R2 is not configured');
  return { uploadUrl: r2Presign(cfg, 'PUT', key), publicUrl: publicUrlForKey(key) };
}

/** Asks R2 what actually landed — never trust the browser's claimed size or type. */
export async function statDirectUpload(key: string): Promise<{ size: number; contentType: string } | null> {
  const cfg = r2Config();
  if (!cfg) return null;
  const res = await fetch(r2Presign(cfg, 'HEAD', key, 60), { method: 'HEAD', cache: 'no-store' });
  if (!res.ok) return null;
  return {
    size: Number(res.headers.get('content-length') ?? 0),
    contentType: res.headers.get('content-type') ?? '',
  };
}

/** Saves an upload that came through the server (Vercel Blob or local disk). */
export async function saveServerUpload(file: File, key: string): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(key, file, {
      access: 'public',
      addRandomSuffix: false,
      contentType: file.type || undefined,
    });
    return blob.url;
  }
  const filePath = path.join(process.cwd(), 'public', 'uploads', key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));
  return `/uploads/${key}`;
}

/** Removes a stored file wherever it lives. Never throws — a leftover file is harmless. */
export async function deleteStored(input: { key?: string | null; url: string }) {
  try {
    const cfg = r2Config();
    if (cfg && input.key && input.url.startsWith(cfg.publicUrl)) {
      await fetch(r2Presign(cfg, 'DELETE', input.key, 60), { method: 'DELETE' });
      return;
    }
    if (input.url.startsWith('/uploads/')) {
      fs.rmSync(path.join(process.cwd(), 'public', input.url), { force: true });
      return;
    }
    if (process.env.BLOB_READ_WRITE_TOKEN && /blob\.vercel-storage\.com/.test(input.url)) {
      const { del } = await import('@vercel/blob');
      await del(input.url);
    }
  } catch (err) {
    console.warn('[storage] delete failed for', input.url, err);
  }
}
