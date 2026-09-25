import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp',
};

/**
 * Local-storage mode only (no R2 / Blob configured). `next start` serves
 * only the files that were in public/ when it booted, so a photo uploaded
 * afterwards would 404 until a restart. This serves them straight from
 * disk. On Vercel, media lives in R2 or Blob and this never has anything
 * to serve.
 */
export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const root = path.join(process.cwd(), 'public', 'uploads');
  const file = path.resolve(root, ...params.path);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new Response('Not found', { status: 404 });
  }
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  return new Response(fs.readFileSync(file), {
    headers: { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' },
  });
}
