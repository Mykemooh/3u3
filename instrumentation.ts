/**
 * Runs once when a server instance starts (Next.js instrumentation).
 * Turns on Sentry error capture when SENTRY_DSN is set (lib/monitoring.ts);
 * does nothing otherwise.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
    const { installConsoleCapture } = await import('./lib/monitoring');
    installConsoleCapture();
  }
}
