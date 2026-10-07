'use client';

import { useT } from '@/components/i18n/LocaleProvider';
import { accountMessages } from '@/lib/i18n/messages/account';

export default function PrintButton({ label }: { label?: string }) {
  const t = useT(accountMessages);
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary btn-sm">
      {label ?? t('printSavePdf')}
    </button>
  );
}
