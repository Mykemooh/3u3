/**
 * Renders the help format: blank line between paragraphs, "- " bullets,
 * "1. " steps, "## " subheadings. Text only — no HTML from articles is
 * ever rendered.
 */
export default function ArticleBody({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-4 leading-relaxed text-slate">
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines[0].startsWith('## ')) {
          const rest = lines.slice(1).join('\n');
          return (
            <div key={i} className="space-y-2">
              <h3 className="pt-2 font-bold text-ink">{lines[0].slice(3)}</h3>
              {rest && <ArticleBody body={rest} />}
            </div>
          );
        }
        if (lines.every((l) => /^- /.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5">
              {lines.map((l) => (
                <li key={l}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+\.\s/.test(l))) {
          return (
            <ol key={i} className="space-y-2">
              {lines.map((l, j) => (
                <li key={l} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/10 text-xs font-bold text-gold">{j + 1}</span>
                  <span>{l.replace(/^\d+\.\s/, '')}</span>
                </li>
              ))}
            </ol>
          );
        }
        // A lead-in line followed by bullets.
        const firstBullet = lines.findIndex((l) => /^- /.test(l));
        if (firstBullet > 0 && lines.slice(firstBullet).every((l) => /^- /.test(l))) {
          return (
            <div key={i} className="space-y-2">
              <p>{lines.slice(0, firstBullet).join(' ')}</p>
              <ul className="list-disc space-y-1.5 pl-5">
                {lines.slice(firstBullet).map((l) => (
                  <li key={l}>{l.slice(2)}</li>
                ))}
              </ul>
            </div>
          );
        }
        return <p key={i}>{lines.join(' ')}</p>;
      })}
    </div>
  );
}
