'use client';

import { useEffect, useRef, useState } from 'react';

/** How often the crew's phone reports its position while driving. */
export const REPORT_EVERY_MS = 20_000;

export type ReporterStatus = 'idle' | 'locating' | 'sharing' | 'denied' | 'unavailable';

/** One-off position with a short timeout — used for the "Start driving" tap. */
export function currentPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

/**
 * While `active`, watches the phone's GPS and posts the latest fix to
 * /api/crew/jobs/[id]/location every REPORT_EVERY_MS. Also holds a screen
 * wake lock where the browser supports it, because a locked phone stops
 * running the page — and with it, the tracking. Stops by itself if the
 * server says the trip is over.
 */
export function useLocationReporter(jobId: string, active: boolean) {
  const [status, setStatus] = useState<ReporterStatus>('idle');
  const latest = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!active) {
      setStatus('idle');
      return;
    }
    if (!navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    let stopped = false;
    let lastSent: { lat: number; lng: number } | null = null;
    setStatus('locating');

    const send = async () => {
      const fix = latest.current;
      if (!fix || stopped || fix === lastSent) return;
      lastSent = fix;
      try {
        const res = await fetch(`/api/crew/jobs/${jobId}/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fix),
        });
        const data = await res.json().catch(() => ({}));
        if (data.tracking === false) stop();
      } catch {
        lastSent = null; // retry this fix next round
      }
    };

    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const first = !latest.current;
        latest.current = { lat: p.coords.latitude, lng: p.coords.longitude };
        setStatus('sharing');
        if (first) send();
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    const timer = setInterval(send, REPORT_EVERY_MS);

    let wakeLock: { release: () => Promise<void> } | null = null;
    const lockScreen = async () => {
      try {
        wakeLock = await (navigator as any).wakeLock?.request('screen');
      } catch {
        // Not supported, or the tab isn't visible — tracking still works while the screen is on.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        lockScreen();
        send();
      }
    };
    lockScreen();
    document.addEventListener('visibilitychange', onVisible);

    function stop() {
      stopped = true;
      navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock?.release().catch(() => {});
    }
    return stop;
  }, [jobId, active]);

  return status;
}
