/**
 * Permission keys for admin-tier roles, and which part of the admin each
 * one unlocks. A role is a named bundle of these (lib/roles.ts); the
 * default Admin role always has all of them, so nothing an owner could
 * already do is ever taken away by this layer.
 *
 * Crew roles don't use these keys. They pick how they work on a job
 * (Team lead / Cleaner / Junior — users.staffRole), which the existing job
 * rules already understand, plus the two crew keys at the bottom.
 */
export type AdminPermission =
  | 'schedule.manage'
  | 'clients.manage'
  | 'quotes.manage'
  | 'invoices.manage'
  | 'payroll.manage'
  | 'team.manage'
  | 'reports.view'
  | 'marketing.manage'
  | 'messages.manage'
  | 'expenses.manage'
  | 'supplies.manage'
  | 'help.manage'
  | 'settings.manage'
  | 'billing.manage';

export type CrewPermission = 'crew.pricing' | 'crew.team_schedule';

export type Permission = AdminPermission | CrewPermission;

export const ADMIN_PERMISSIONS: { key: AdminPermission; label: string; detail: string }[] = [
  { key: 'schedule.manage', label: 'Schedule', detail: 'Calendar, recurring cleans, templates, routes, assigning teams' },
  { key: 'clients.manage', label: 'Clients & leads', detail: 'Client profiles, homes, leads and the pipeline' },
  { key: 'quotes.manage', label: 'Quotes & pricing', detail: 'Estimates, client rates and add-ons' },
  { key: 'invoices.manage', label: 'Invoices', detail: 'Review, send and void invoices' },
  { key: 'payroll.manage', label: 'Payroll', detail: 'Pay runs, timesheets and tips' },
  { key: 'team.manage', label: 'Team & roles', detail: 'Add people, set pay, rename and edit roles' },
  { key: 'reports.view', label: 'Reports', detail: 'Dashboard, cleaning reports and change history' },
  { key: 'marketing.manage', label: 'Marketing & reviews', detail: 'Campaigns, referrals, win-back, reviews' },
  { key: 'messages.manage', label: 'Messages', detail: 'Two-way texts with clients and Tex conversations' },
  { key: 'expenses.manage', label: 'Expenses', detail: 'Record and review business expenses' },
  { key: 'supplies.manage', label: 'Supplies', detail: 'Supply reports from the crew' },
  { key: 'help.manage', label: 'Help articles', detail: "Edit the company's own FAQs and SOPs Tex answers from" },
  { key: 'settings.manage', label: 'Settings', detail: 'Services, automations, integrations, company settings' },
  { key: 'billing.manage', label: 'Billing', detail: "The company's own TrashCan subscription" },
];

export const CREW_PERMISSIONS: { key: CrewPermission; label: string; detail: string }[] = [
  { key: 'crew.pricing', label: 'See prices', detail: 'Show the job price on the visit card' },
  { key: 'crew.team_schedule', label: "See the team's schedule", detail: 'See every job on their team, not just their own' },
];

export const ALL_ADMIN_PERMISSION_KEYS: AdminPermission[] = ADMIN_PERMISSIONS.map((p) => p.key);

/**
 * Which permission a path needs. Longest prefix wins; null means any admin
 * may open it (the landing page, setup guide, help). Shared by the pages
 * (app/admin/layout.tsx) and the API (lib/adminApi.ts) so they can't
 * disagree.
 */
const PATH_RULES: [string, AdminPermission][] = [
  ['/admin/schedule', 'schedule.manage'],
  ['/admin/series', 'schedule.manage'],
  ['/admin/templates', 'schedule.manage'],
  ['/admin/routes', 'schedule.manage'],
  ['/admin/bookings', 'schedule.manage'],
  ['/api/admin/bookings', 'schedule.manage'],
  ['/api/admin/jobs', 'schedule.manage'],
  ['/api/admin/routes', 'schedule.manage'],
  ['/api/admin/series', 'schedule.manage'],
  ['/api/admin/templates', 'schedule.manage'],
  ['/api/admin/find-a-time', 'schedule.manage'],
  ['/admin/clients', 'clients.manage'],
  ['/admin/leads', 'clients.manage'],
  ['/admin/pipeline', 'clients.manage'],
  ['/api/admin/clients', 'clients.manage'],
  ['/api/admin/leads', 'clients.manage'],
  ['/api/admin/addresses', 'clients.manage'],
  ['/admin/estimates', 'quotes.manage'],
  ['/admin/rates', 'quotes.manage'],
  ['/admin/addons', 'quotes.manage'],
  ['/api/admin/estimates', 'quotes.manage'],
  ['/api/admin/rates', 'quotes.manage'],
  ['/api/admin/addons', 'quotes.manage'],
  ['/api/admin/clients/*/rates', 'quotes.manage'],
  ['/api/admin/clients/*/addon-rates', 'quotes.manage'],
  ['/admin/invoices', 'invoices.manage'],
  ['/api/admin/invoices', 'invoices.manage'],
  ['/admin/payroll', 'payroll.manage'],
  ['/api/admin/payroll', 'payroll.manage'],
  ['/admin/team', 'team.manage'],
  ['/admin/crew', 'team.manage'],
  ['/admin/roles', 'team.manage'],
  ['/api/admin/team', 'team.manage'],
  ['/api/admin/crew', 'team.manage'],
  ['/api/admin/roles', 'team.manage'],
  ['/admin/dashboard', 'reports.view'],
  ['/admin/reports', 'reports.view'],
  ['/admin/activity', 'reports.view'],
  ['/api/admin/export', 'reports.view'],
  ['/admin/marketing', 'marketing.manage'],
  ['/admin/reviews', 'marketing.manage'],
  ['/api/admin/reviews', 'marketing.manage'],
  ['/api/admin/campaigns', 'marketing.manage'],
  ['/api/admin/marketing', 'marketing.manage'],
  ['/admin/messages', 'messages.manage'],
  ['/admin/notifications', 'messages.manage'],
  ['/api/admin/messages', 'messages.manage'],
  ['/api/admin/notifications', 'messages.manage'],
  ['/admin/expenses', 'expenses.manage'],
  ['/api/admin/expenses', 'expenses.manage'],
  ['/admin/supplies', 'supplies.manage'],
  ['/api/admin/supplies', 'supplies.manage'],
  ['/api/admin/kb', 'help.manage'],
  ['/api/admin/tex', 'messages.manage'],
  ['/admin/settings', 'settings.manage'],
  ['/admin/services', 'settings.manage'],
  ['/admin/integrations', 'settings.manage'],
  ['/admin/automations', 'settings.manage'],
  ['/api/admin/settings', 'settings.manage'],
  ['/api/admin/services', 'settings.manage'],
  ['/api/admin/service-area', 'settings.manage'],
  ['/api/admin/integrations', 'settings.manage'],
  ['/api/admin/automations', 'settings.manage'],
  ['/api/admin/dashboard-settings', 'settings.manage'],
  ['/api/admin/connect', 'settings.manage'],
  ['/admin/developers', 'settings.manage'],
  ['/api/admin/developers', 'settings.manage'],
  ['/billing', 'billing.manage'],
  ['/api/admin/billing', 'billing.manage'],
];

export function permissionForPath(pathname: string): AdminPermission | null {
  let best: { len: number; perm: AdminPermission } | null = null;
  for (const [prefix, perm] of PATH_RULES) {
    // A "*" stands for one path segment (an id).
    const pattern = new RegExp(
      '^' + prefix.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+') + '(/|$)',
    );
    if (pattern.test(pathname) && (!best || prefix.length > best.len)) best = { len: prefix.length, perm };
  }
  return best ? best.perm : null;
}

export function parsePermissions(list: string | null | undefined): Permission[] {
  return (list ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean) as Permission[];
}

export function serializePermissions(perms: Permission[]): string {
  const known = new Set<string>([...ALL_ADMIN_PERMISSION_KEYS, ...CREW_PERMISSIONS.map((p) => p.key)]);
  return Array.from(new Set(perms.filter((p) => known.has(p)))).sort().join(',');
}
