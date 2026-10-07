'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import { crewMessages } from '@/lib/i18n/messages/crew';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const DISMISS_KEY = 'tc.crewInstallDismissed';

/**
 * "Add TrashCan Crew to your home screen" (public/crew.webmanifest). Shows
 * only in a phone browser, never once installed or after "Not now". Android
 * Chrome gets a one-tap install; iPhone gets the Share → Add to Home Screen
 * steps, since Safari offers no install button to call.
 */
export default function InstallAppCard() {
  const t = useT(crewMessages);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [mode, setMode] = useState<'hidden' | 'prompt' | 'ios' | 'other'>('hidden');

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      dismissed = false;
    }
    const phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (standalone || dismissed || !phone) return;
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    setMode(ios ? 'ios' : 'other');
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
      setMode('prompt');
    };
    const onInstalled = () => setMode('hidden');
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (mode === 'hidden') return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode: just hide it for now */
    }
    setMode('hidden');
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') setMode('hidden');
  }

  return (
    <section className="flex items-start gap-3 rounded-2xl border border-tc-200 bg-white p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/trashcan/crew/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-tc-black">{t('installTitle')}</p>
        <p className="mt-0.5 text-sm text-tc-700">{mode === 'ios' ? t('installIosSteps') : mode === 'other' ? t('installOtherSteps') : t('installBody')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {mode === 'prompt' && (
            <button type="button" onClick={install} className="tc-btn-dark tc-btn-sm">
              {t('installButton')}
            </button>
          )}
          <button type="button" onClick={dismiss} className="text-sm font-semibold text-tc-500 hover:text-tc-black">
            {t('installDismiss')}
          </button>
        </div>
      </div>
    </section>
  );
}
