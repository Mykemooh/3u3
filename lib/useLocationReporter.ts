'use client';

import { useEffect, useRef, useState } from 'react';

/** How often the crew's phone reports its position while driving. */
export const REPORT_EVERY_MS = 20_000;

export type ReporterStatus = 'idle' | 'locating' | 'sharing' | 'denied' | 'unavailable';

type Fix = { lat: number; lng: number; at: number };

/** One-off position with a short timeout — used for the "Start driving" tap. */
export function currentPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      // High accuracy failed (common on laptops, and phones indoors) — any fix beats none.
      () =>
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

/**
 * While `active`, tracks the device's position and posts the latest fix to
 * /api/crew/jobs/[id]/location every REPORT_EVERY_MS.
 *
 * Never gives up on the first error: GPS-grade ("high accuracy") positions
 * routinely fail on laptops and indoors, so after an error it falls back to
 * normal accuracy (Wi-Fi / cell towers), and every round it asks again if
 * the watch has gone quiet. Status recovers to 'sharing' as soon as a fix
 * comes through; `detail` carries the browser's own error for the crew.
 *
 * Also holds a screen wake lock where supported, because a locked phone
 * stops running the page — and with it, the tracking. Stops by itself if
 * the server says the trip is over.
 */
export function useLocationReporter(jobId: string, active: boolean) {
  const [status, setStatus] = useState<ReporterStatus>('idle');
  const [detail, setDetail] = useState<string | null>(null);
  const latest = useRef<Fix | null>(null);

  useEffect(() => {
    if (!active) {
      setStatus('idle');
      setDetail(null);
      return;
    }
    if (!navigator.geolocation) {
      setStatus('unavailable');
      setDetail("This browser doesn't support location.");
      return;
    }
    const geo = navigator.geolocation;
    let stopped = false;
    let lastSent: Fix | null = null;
    let watch: number | null = null;
    let highAccuracy = true;
    setStatus('locating');

    const send = async () => {
      const fix = latest.current;
      if (!fix || stopped || fix === lastSent) return;
      lastSent = fix;
      try {
        const res = await fetch(`/api/crew/jobs/${jobId}/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: fix.lat, lng: fix.lng }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.tracking === false) stop();
      } catch {
        lastSent = null; // retry this fix next round
      }
    };

    const onFix = (p: GeolocationPosition) => {
      if (stopped) return;
      const first = !latest.current;
      latest.current = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() };
      setStatus('sharing');
      setDetail(null);
      if (first) send();
    };

    const onError = (err: GeolocationPositionError) => {
      if (stopped) return;
      setDetail(err.message || null);
      if (err.code === err.PERMISSION_DENIED) {
        setStatus('denied');
        return;
      }
      // Only flag a problem if we have nothing recent to send.
      if (!latest.current || Date.now() - latest.current.at > REPORT_EVERY_MS * 2) setStatus('unavailable');
      if (highAccuracy) {
        highAccuracy = false;
        startWatch();
      }
    };

    function startWatch() {
      if (watch != null) geo.clearWatch(watch);
      watch = geo.watchPosition(onFix, onError, { enableHighAccuracy: highAccuracy, maximumAge: 10_000 });
    }
    startWatch();

    // Each round: if the watch hasn't delivered lately, ask directly, then send.
    const timer = setInterval(() => {
      const fresh = latest.current && Date.now() - latest.current.at < REPORT_EVERY_MS * 1.5;
      if (fresh) return void send();
      geo.getCurrentPosition(
        (p) => {
          onFix(p);
          send();
        },
        onError,
        { enableHighAccuracy: highAccuracy, timeout: 15_000, maximumAge: 60_000 },
      );
    }, REPORT_EVERY_MS);

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
      if (watch != null) geo.clearWatch(watch);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock?.release().catch(() => {});
    }
    return stop;
  }, [jobId, active]);

  return { status, detail };
}
