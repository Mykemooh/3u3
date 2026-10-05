/**
 * Every cadence a booking can carry. Clients choose from the three on
 * CLIENT_CADENCES when they book or change a visit themselves; the rest
 * come from recurring series an admin sets up (lib/recurring.ts).
 */
export type Cadence = 'ONE_TIME' | 'WEEKLY' | 'BIWEEKLY' | 'EVERY_4_WEEKS' | 'MONTHLY' | 'CUSTOM';

export const CADENCE_LABEL: Record<Cadence, string> = {
  ONE_TIME: 'One-time',
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Every other week',
  EVERY_4_WEEKS: 'Every 4 weeks',
  MONTHLY: 'Monthly',
  CUSTOM: 'Custom schedule',
};

/** What a client may pick for themselves. */
export const CLIENT_CADENCES: Cadence[] = ['ONE_TIME', 'BIWEEKLY', 'MONTHLY'];

/** What an admin may pick on a single booking (series have their own patterns). */
export const ADMIN_CADENCES: Cadence[] = ['ONE_TIME', 'WEEKLY', 'BIWEEKLY', 'EVERY_4_WEEKS', 'MONTHLY'];
