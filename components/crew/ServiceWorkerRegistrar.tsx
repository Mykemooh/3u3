'use client';

import { useEffect } from 'react';
import { registerCrewServiceWorker } from '@/lib/offlineSync';

/** Renders nothing — just registers the crew offline service worker so pages the crew has already opened keep loading with no signal. */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerCrewServiceWorker();
  }, []);
  return null;
}
