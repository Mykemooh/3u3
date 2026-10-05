import { getTenant } from '@/lib/data';
import { listTexConversations, texConfigured } from '@/lib/tex';
import TexConversations from '@/components/admin/TexConversations';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function TexPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const conversations = await listTexConversations(tenant.id);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Tex conversations</h2>
        <p className="max-w-2xl text-slate">
          Everything Tex has said in chat, by text and on calls. When Tex can’t help or someone asks for a person, the conversation
          lands in Needs you.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className={`pill ${texConfigured() ? 'bg-green/10 text-green' : 'bg-surface text-slate'}`}>{texConfigured() ? 'AI answers on' : 'Answering from articles (no AI key yet)'}</span>
        <span className={`pill ${tenant.texSmsAutoReply ? 'bg-green/10 text-green' : 'bg-surface text-slate'}`}>Texts {tenant.texSmsAutoReply ? 'on' : 'off'}</span>
        <span className={`pill ${tenant.texVoiceEnabled ? 'bg-green/10 text-green' : 'bg-surface text-slate'}`}>Calls {tenant.texVoiceEnabled ? 'on' : 'off'}</span>
        <Link href="/admin/settings#texting" className="font-semibold text-gold hover:underline">Change</Link>
        <Link href="/admin/help" className="font-semibold text-gold hover:underline">Teach Tex</Link>
      </div>
      <TexConversations conversations={conversations} />
    </div>
  );
}
