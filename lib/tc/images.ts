/**
 * Photography slots on TrashCan's marketing site. Each slot shows a
 * labelled placeholder (with its brief) until `file` is set — drop the
 * image into public/images/trashcan/ and fill in the path here.
 *
 * Direction for every slot (guide §8): real commercial photography, never
 * stock poses. Natural daylight, documentary framing, real homes. Black
 * TRASHCAN polos are fine on crew. Wide environmental frames when showing
 * people at work. Full briefs: docs/brand/trashcan-image-briefs.md.
 */

export type ImageSlotKey = 'owner-office' | 'crew-arrival' | 'kitchen-finish' | 'phone-in-hand' | 'team-huddle' | 'founders';

export const TC_IMAGES: Record<ImageSlotKey, { title: string; brief: string; alt: string; file: string | null }> = {
  'owner-office': {
    title: 'Owner at the kitchen-table office',
    brief:
      'A cleaning-business owner at a kitchen table or small home office in morning light, laptop open to the TrashCan dashboard, phone face-up beside it, coffee. Shot from slightly behind the shoulder so the screen reads but the person is the subject. Calm, in control. Landscape, 3:2.',
    alt: 'A cleaning-business owner checking the day’s jobs on a laptop at a kitchen table',
    file: null,
  },
  'crew-arrival': {
    title: 'Crew arriving at a home',
    brief:
      'Two or three cleaners in black polos walking up a Texas suburban driveway with caddies and a vacuum, late-morning daylight, one checking a phone. Wide environmental frame — the house and the walk matter more than faces. Landscape, 16:10.',
    alt: 'A crew lead going over the day’s jobs on his phone with three cleaners by their van',
    file: '/images/trashcan/crew-arrival.jpg',
  },
  'kitchen-finish': {
    title: 'A finished kitchen',
    brief:
      'A real, lived-in kitchen just after a clean: wiped counters with real objects put back, light across the floor, no styling props. A cleaner’s hand photographing the counter with a phone at the edge of the frame. Portrait, 4:5.',
    alt: 'A freshly cleaned kitchen being photographed for the client',
    file: null,
  },
  'phone-in-hand': {
    title: 'Crew app in hand',
    brief:
      'Close crop of a cleaner’s gloved or bare hand holding a phone showing the room checklist, a bathroom or hallway soft in the background. Natural light, shallow depth of field. Square, 1:1.',
    alt: 'A cleaner checking off a room on their phone',
    file: null,
  },
  'team-huddle': {
    title: 'Morning huddle',
    brief:
      'An owner and three cleaners standing by a van or garage in the morning, owner holding a phone showing the day’s route, everyone mid-conversation. Unposed, documentary. Landscape, 3:2.',
    alt: 'An owner going over the day’s route with the crew',
    file: null,
  },
  founders: {
    title: 'The family behind TRASHCAN',
    brief:
      'The founding couple at home or by their work vehicle — the people who built TrashCan for their own crews. Natural, warm daylight, not a studio portrait. Landscape, 3:2.',
    alt: 'The founders, who built TrashCan for their own cleaning company',
    file: null,
  },
};
