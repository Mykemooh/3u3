/**
 * Error monitoring with Sentry (sentry.io), sent straight to Sentry's
 * envelope endpoint with fetch — no SDK, no build plugin, nothing runs
 * until SENTRY_DSN is set.
 *
 * Server errors: instrumentation.ts forwards every Error passed to
 * console.error (which is where Next.js logs a failed request, and where
 * this app logs every caught failure) — see installConsoleCapture().
 * Browser errors: components/ErrorReporter.tsx posts them to
 * /api/monitoring/client-error, which forwards them here, so the DSN never
 * has to be shipped to the browser.
 *
 * What's sent: the error's type, message and stack, the page or route
 * path, the environment and the deployed commit. Never request bodies,
 * cookies, headers or query strings.
 */

type Dsn = { key: string; host: string; projectId: string; raw: string };

export function parseDsn(raw: string | undefined): Dsn | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    const projectId = u.pathname.replace(/^\/+|\/+$/g, '').split('/').pop();
    if (!u.username || !projectId || u.protocol !== 'https:') return null;
    const prefix = u.pathname.replace(/\/[^/]+\/?$/, '');
    return { key: u.username, host: `${u.protocol}//${u.host}${prefix}`, projectId, raw: raw.trim() };
  } catch {
    return null;
  }
}

export const monitoringConfigured = () => !!parseDsn(process.env.SENTRY_DSN);

type Frame = { function?: string; filename?: string; lineno?: number; colno?: number; in_app?: boolean };

/** V8 stack lines → Sentry frames, oldest call first (Sentry's order). */
export function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split('\n').slice(1, 51)) {
    const m = line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
    if (!m) continue;
    const filename = m[2];
    frames.push({ function: m[1] || '<anonymous>', filename, lineno: Number(m[3]), colno: Number(m[4]), in_app: !filename.includes('node_modules') && !filename.startsWith('node:') });
  }
  return frames.reverse();
}

/** Strips query strings and fragments, so tokens in links never leave. */
export const safePath = (url: string | undefined | null) => {
  if (!url) return undefined;
  try {
    return new URL(url, 'http://x').pathname.slice(0, 300);
  } catch {
    return String(url).split(/[?#]/)[0].slice(0, 300);
  }
};

const recent: number[] = [];
const PER_MINUTE = 30;

export type CaptureContext = { message?: string; path?: string; platform?: 'node' | 'javascript'; tags?: Record<string, string> };

/** Sends one error to Sentry. Never throws; returns whether it was sent. */
export async function captureException(err: unknown, ctx: CaptureContext = {}): Promise<boolean> {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return false;
  const now = Date.now();
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= PER_MINUTE) return false;
  recent.push(now);

  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Non-error thrown');
  const eventId = crypto.randomUUID().replace(/-/g, '');
  const event = {
    event_id: eventId,
    timestamp: now / 1000,
    platform: ctx.platform ?? 'node',
    level: 'error',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'production',
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    transaction: ctx.path,
    message: ctx.message ? { formatted: ctx.message.slice(0, 500) } : undefined,
    tags: { ...(ctx.tags ?? {}), ...(ctx.path ? { path: ctx.path } : {}) },
    exception: {
      values: [{ type: e.name || 'Error', value: (e.message || '').slice(0, 1000), stacktrace: { frames: parseStack(e.stack) } }],
    },
  };
  const body = [JSON.stringify({ event_id: eventId, sent_at: new Date(now).toISOString(), dsn: dsn.raw }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n');
  try {
    const res = await fetch(`${dsn.host}/api/${dsn.projectId}/envelope/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=trashcan/1.0`,
      },
      body,
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let installed = false;

/**
 * Forwards every Error logged with console.error to Sentry, keeping the
 * normal log line. Installed once from instrumentation.ts.
 */
export function installConsoleCapture() {
  if (installed || !monitoringConfigured()) return;
  installed = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    const err = args.find((a): a is Error => a instanceof Error);
    if (!err) return;
    // captureException never logs, so this can't loop.
    const message = args.filter((a) => typeof a === 'string').join(' ').slice(0, 300) || undefined;
    void captureException(err, { message });
  };
  process.on('unhandledRejection', (reason) => void captureException(reason, { message: 'Unhandled promise rejection' }));
}
