'use client';

export default function PrintButton({ label = 'Save as PDF' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary btn-sm">
      {label}
    </button>
  );
}
