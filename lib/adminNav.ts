import type { AdminPermission } from '@/lib/permissions';

/**
 * The admin portal's map: the icon rail's sections, and the pages inside
 * each one (shown as tabs at the top of the page). One definition, read by
 * the rail, the phone tab bar and the "you don't have access" check.
 */

export type IconName =
  | 'home' | 'calendar' | 'users' | 'quote' | 'spray' | 'invoice' | 'wallet' | 'chat'
  | 'megaphone' | 'chart' | 'receipt' | 'team' | 'help' | 'settings' | 'plus' | 'pin'
  | 'repeat' | 'template' | 'route' | 'mail' | 'clock' | 'box' | 'star' | 'shield' | 'more' | 'sparkle' | 'x';

export type NavPage = { href: string; label: string; perm?: AdminPermission | null };
export type NavSection = {
  key: string;
  label: string;
  icon: IconName;
  href: string;
  perm?: AdminPermission | null;
  pages: NavPage[];
  /** Groups are separated by a thin line on the rail. */
  group: number;
};

export const ADMIN_SECTIONS: NavSection[] = [
  { key: 'home', label: 'Home', icon: 'home', href: '/admin', perm: null, group: 0, pages: [{ href: '/admin', label: 'Today' }, { href: '/admin/setup', label: 'Setup guide' }] },
  {
    key: 'schedule', label: 'Schedule', icon: 'calendar', href: '/admin/schedule', perm: 'schedule.manage', group: 0,
    pages: [
      { href: '/admin/schedule', label: 'Calendar' },
      { href: '/admin/series', label: 'Recurring cleans' },
      { href: '/admin/templates', label: 'Templates' },
      { href: '/admin/routes', label: 'Routes' },
      { href: '/admin/bookings', label: 'All bookings' },
    ],
  },
  {
    key: 'clients', label: 'Clients', icon: 'users', href: '/admin/clients', perm: 'clients.manage', group: 1,
    pages: [
      { href: '/admin/clients', label: 'Clients' },
      { href: '/admin/leads', label: 'Leads' },
      { href: '/admin/pipeline', label: 'Pipeline' },
    ],
  },
  {
    key: 'quotes', label: 'Quotes', icon: 'quote', href: '/admin/estimates', perm: 'quotes.manage', group: 1,
    pages: [
      { href: '/admin/estimates', label: 'Quotes' },
      { href: '/admin/rates', label: 'Client rates' },
      { href: '/admin/addons', label: 'Add-ons' },
    ],
  },
  { key: 'jobs', label: 'Cleans & photos', icon: 'spray', href: '/crew', perm: 'schedule.manage', group: 1, pages: [] },
  { key: 'invoices', label: 'Invoices', icon: 'invoice', href: '/admin/invoices', perm: 'invoices.manage', group: 1, pages: [] },
  { key: 'payroll', label: 'Payroll', icon: 'wallet', href: '/admin/payroll', perm: 'payroll.manage', group: 1, pages: [] },
  {
    key: 'messages', label: 'Messages', icon: 'chat', href: '/admin/messages', perm: 'messages.manage', group: 2,
    pages: [
      { href: '/admin/messages', label: 'Texts' },
      { href: '/admin/messages/tex', label: 'Tex conversations' },
      { href: '/admin/notifications', label: 'Alerts' },
    ],
  },
  {
    key: 'marketing', label: 'Marketing', icon: 'megaphone', href: '/admin/marketing', perm: 'marketing.manage', group: 2,
    pages: [
      { href: '/admin/marketing', label: 'Growth' },
      { href: '/admin/reviews', label: 'Reviews' },
    ],
  },
  {
    key: 'reports', label: 'Reports', icon: 'chart', href: '/admin/reports', perm: 'reports.view', group: 2,
    pages: [
      { href: '/admin/reports', label: 'Cleaning reports' },
      { href: '/admin/dashboard', label: 'Dashboard' },
      { href: '/admin/activity', label: 'Change history' },
    ],
  },
  {
    key: 'expenses', label: 'Expenses', icon: 'receipt', href: '/admin/expenses', perm: 'expenses.manage', group: 2,
    pages: [
      { href: '/admin/expenses', label: 'Expenses' },
      { href: '/admin/supplies', label: 'Supplies', perm: 'supplies.manage' },
    ],
  },
  {
    key: 'team', label: 'Team', icon: 'team', href: '/admin/team', perm: 'team.manage', group: 3,
    pages: [
      { href: '/admin/team', label: 'Team' },
      { href: '/admin/roles', label: 'Roles' },
    ],
  },
  { key: 'help', label: 'Help & SOPs', icon: 'help', href: '/admin/help', perm: null, group: 3, pages: [] },
  {
    key: 'settings', label: 'Settings', icon: 'settings', href: '/admin/settings', perm: 'settings.manage', group: 3,
    pages: [
      { href: '/admin/settings', label: 'Company' },
      { href: '/admin/services', label: 'Services' },
      { href: '/admin/automations', label: 'Reminders & follow-ups' },
      { href: '/admin/integrations', label: 'Integrations' },
      { href: '/billing', label: 'Billing', perm: 'billing.manage' },
    ],
  },
];

export type QuickCreate = { href: string; label: string; detail: string; icon: IconName; perm: AdminPermission };

export const QUICK_CREATE: QuickCreate[] = [
  { href: '/admin/series/new', label: 'Schedule a clean', detail: 'One-time or recurring, from a template', icon: 'calendar', perm: 'schedule.manage' },
  { href: '/admin/clients?new=1', label: 'Add a client', detail: 'Name, phone, home details', icon: 'users', perm: 'clients.manage' },
  { href: '/admin/estimates?new=1', label: 'Write a quote', detail: 'After a walkthrough', icon: 'quote', perm: 'quotes.manage' },
  { href: '/admin/messages?new=1', label: 'Text a client', detail: 'Two-way, from your business number', icon: 'chat', perm: 'messages.manage' },
  { href: '/admin/expenses?new=1', label: 'Record an expense', detail: 'Supplies, gas, equipment', icon: 'receipt', perm: 'expenses.manage' },
];

/** Which section a path belongs to — the longest matching href wins. */
export function sectionFor(pathname: string): NavSection | undefined {
  let best: { section: NavSection; len: number } | undefined;
  for (const section of ADMIN_SECTIONS) {
    for (const href of [section.href, ...section.pages.map((p) => p.href)]) {
      const match = pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'));
      if (match && (!best || href.length > best.len)) best = { section, len: href.length };
    }
  }
  return best?.section;
}
