'use client';

import { useEffect } from 'react';

/**
 * Sends uncaught browser errors to /api/monitoring/client-error (which
 * forwards them to Sentry). Rendered only when SENTRY_DSN is set; at most
 * five reports per page load, and only the path — never the query string.
 */
export default function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const report = (e: { name?: string; message?: string; stack?: string }) => {
      if (sent >= 5 || !e.message) return;
      sent += 1;
      const body = JSON.stringify({ name: e.name, message: e.message, stack: e.stack, url: window.location.pathname });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/monitoring/client-error', new Blob([body], { type: 'application/json' }));
      else void fetch('/api/monitoring/client-error', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => undefined);
    };
    const onError = (ev: ErrorEvent) => report(ev.error instanceof Error ? ev.error : { message: ev.message });
    const onRejection = (ev: PromiseRejectionEvent) => report(ev.reason instanceof Error ? ev.reason : { message: String(ev.reason) });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
