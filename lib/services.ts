
/**
 * Marketing copy for the four services, keyed to the same
 * STANDARD / DEEP / MOVE_IN_OUT / AIRBNB values the database uses, so the
 * public pages and the booking flow can never drift apart.
 *
 * Two deliberate omissions:
 *
 *  - No prices. The whole promise of this business is that a real person
 *    confirms the price at your door (PRD 6.2), and a number printed here
 *    would anchor people before anyone has seen the house.
 *  - No claims about the company that aren't verifiably true yet —
 *    no "insured and bonded", no "background-checked", no counts of
 *    happy customers. Those are easy to add once they're true and
 *    expensive to have written down before.
 *
 * The room-by-room lists are sensible industry defaults for residential
 * cleaning in the Houston area, not a transcription of the company's own
 * Cleaning Checklists SOP — worth reconciling with that document before
 * this is treated as a promise to customers.
 */

export type ServiceKey = 'STANDARD' | 'DEEP' | 'MOVE_IN_OUT' | 'AIRBNB';

export type ServiceContent = {
  key: ServiceKey;
  slug: string;
  name: string;
  /** One line under the name, on cards and at the top of the page. */
  tagline: string;
  /** Two or three sentences: who this is for and what they get. */
  summary: string;
  bestFor: string[];
  cadence: string;
  typicalLength: string;
  /** Room-by-room, the way a customer pictures their own house. */
  includes: { area: string; items: string[] }[];
  /** Said plainly, because surprises at the door are what lose customers. */
  notIncluded: string[];
  /** A local detail that a national franchise page wouldn't bother with. */
  houstonNote: string;
};

export const ADD_ONS = [
  'Inside the oven',
  'Inside the refrigerator',
  'Interior windows and tracks',
  'Laundry — wash, dry and fold',
  'Cabinet interiors',
  'Garage sweep-out',
  'Patio or porch sweep',
  'Pantry or closet organising',
];

export const SERVICES: ServiceContent[] = [
  {
    key: 'STANDARD',
    slug: 'standard-cleaning',
    name: 'Standard Cleaning',
    tagline: 'The regular clean that keeps a home from ever getting away from you.',
    summary:
      'Our maintenance clean for homes that are already in reasonable shape. The crew works the whole house on a fixed room-by-room checklist, so the same things get done every visit and nothing quietly gets skipped because it was a busy week. Most families put this on a bi-weekly rhythm.',
    bestFor: [
      'Homes already on a cleaning routine',
      'Busy families who want one less thing to think about',
      'Anyone keeping a home consistently guest-ready',
    ],
    cadence: 'Weekly, bi-weekly or monthly',
    typicalLength: 'About 2–3 hours for a typical 3-bed, 2-bath home',
    includes: [
      {
        area: 'Kitchen',
        items: [
          'Countertops and backsplash wiped down',
          'Sink scrubbed and fixtures polished',
          'Stovetop and range hood exterior degreased',
          'Microwave cleaned inside and out',
          'Appliance exteriors — fridge, dishwasher, oven front',
          'Cabinet fronts spot-cleaned',
          'Trash emptied and liner replaced',
          'Floors vacuumed and mopped',
        ],
      },
      {
        area: 'Bathrooms',
        items: [
          'Toilets cleaned inside, outside and behind the base',
          'Tub and shower scrubbed, including the door track',
          'Mirrors and chrome polished streak-free',
          'Counters, sinks and vanity wiped',
          'Towels straightened, trash emptied',
          'Floors vacuumed and mopped',
        ],
      },
      {
        area: 'Bedrooms and living areas',
        items: [
          'Beds made — or linens changed if you leave fresh ones out',
          'All reachable surfaces dusted, including shelves and frames',
          'Mirrors and glass cleaned',
          'Visible clutter tidied into sensible places, not hidden',
          'Carpets vacuumed, hard floors vacuumed and mopped',
        ],
      },
      {
        area: 'Throughout',
        items: [
          'Cobwebs removed from corners and ceilings',
          'Light switches and door handles wiped — the spots everyone touches',
          'Baseboards spot-dusted where visible',
          'Entry mats shaken out',
        ],
      },
    ],
    notIncluded: [
      'Inside the oven or refrigerator — available as an add-on',
      'Interior or exterior windows beyond spot-cleaning glass',
      'Wall washing, blind detailing or carpet shampooing',
      'Moving heavy furniture or appliances',
      'Laundry, dishes left in the sink, or organising',
    ],
    houstonNote:
      'Houston humidity means bathroom grout and shower corners turn faster here than almost anywhere. On a bi-weekly standard clean we stay ahead of it; let it go a season and it usually needs a deep clean to reset.',
  },
  {
    key: 'DEEP',
    slug: 'deep-cleaning',
    name: 'Deep Cleaning',
    tagline: 'A full reset — the build-up a regular clean never reaches.',
    summary:
      'Everything in a standard clean, plus all the surfaces that normally get walked past: baseboards by hand, door frames, blinds, vents, ceiling fans, light fixtures, shower grout and hard-water build-up. This is what most homes need the first time we come, and what a lot of families book seasonally rather than on a schedule.',
    bestFor: [
      'A first clean before starting a regular schedule',
      'Spring and post-summer resets',
      'Before hosting, or after a renovation settles',
      'A home that has been without help for a while',
    ],
    cadence: 'One-time, or quarterly',
    typicalLength: 'Roughly one and a half to two times a standard clean',
    includes: [
      {
        area: 'Everything in a Standard Clean',
        items: ['Every room-by-room item above is completed first, then the detail work below.'],
      },
      {
        area: 'Detail work',
        items: [
          'Baseboards hand-wiped along their full length, not spot-dusted',
          'Door faces, frames and the tops of doors',
          'Window sills, ledges and interior sill tracks',
          'Blinds dusted slat by slat',
          'Ceiling fan blades and light fixtures',
          'Air vents and return covers dusted',
          'Switch plates and outlet covers wiped individually',
        ],
      },
      {
        area: 'Kitchen, in depth',
        items: [
          'Cabinet fronts degreased rather than spot-cleaned',
          'Backsplash grout worked where build-up has set in',
          'Under and behind small appliances',
          'Range hood filter surface degreased',
          'Baseboard edges and toe-kicks',
        ],
      },
      {
        area: 'Bathrooms, in depth',
        items: [
          'Shower grout scrubbed line by line',
          'Hard-water and soap scum removed from glass and fixtures',
          'Behind the toilet base and along the floor seal',
          'Exhaust fan cover dusted',
        ],
      },
    ],
    notIncluded: [
      'Inside the oven or refrigerator — available as an add-on',
      'Carpet shampooing or steam cleaning',
      'Exterior windows, pressure washing or gutters',
      'Mould remediation, or anything behind a wall',
      'Moving heavy furniture or appliances',
    ],
    houstonNote:
      'Two things drive deep cleans here: pollen season coating every sill and ledge, and the humidity that settles into shower grout and vent covers. A lot of Katy families book one in early spring and another once summer breaks.',
  },
  {
    key: 'MOVE_IN_OUT',
    slug: 'move-in-move-out-cleaning',
    name: 'Move-In / Move-Out Cleaning',
    tagline: 'An empty house, cleaned like someone is about to inspect it — because they are.',
    summary:
      'A top-to-bottom clean of an empty home, done to the standard a landlord walkthrough or a buyer\'s final inspection is actually judged against. Because the house is empty, we reach everything: inside every cabinet and drawer, inside closets, appliance interiors, window tracks, and every baseboard in the place.',
    bestFor: [
      'End-of-lease cleans where a deposit is on the line',
      'Handing over a house at closing',
      'Moving into a home someone else just left',
      'Landlords turning a property between tenants',
    ],
    cadence: 'One-time, scheduled around your move date',
    typicalLength: 'A half day or more, depending on size and condition',
    includes: [
      {
        area: 'Every room',
        items: [
          'Inside all cabinets, drawers and closets — shelves wiped, corners vacuumed',
          'All baseboards, door faces, frames and tops of doors',
          'Switch plates, outlet covers, vents and returns',
          'Interior windows, sills and tracks',
          'Ceiling fans, light fixtures and globes',
          'Cobwebs removed throughout',
          'Floors vacuumed, edged and mopped',
        ],
      },
      {
        area: 'Kitchen',
        items: [
          'Inside the oven, including racks',
          'Inside and behind the refrigerator where it can be safely reached',
          'Inside and outside of every cabinet and drawer',
          'Countertops, backsplash and sink fully detailed',
          'Dishwasher interior seal and filter area',
          'Range hood and filter degreased',
        ],
      },
      {
        area: 'Bathrooms',
        items: [
          'Tubs, showers and grout scrubbed to the tile',
          'Hard-water build-up removed from glass and fixtures',
          'Vanities inside and out, drawers wiped',
          'Toilets detailed including behind the base',
          'Mirrors, medicine cabinets and exhaust covers',
        ],
      },
    ],
    notIncluded: [
      'Carpet shampooing or steam cleaning — we can point you to someone',
      'Exterior windows, pressure washing, gutters or yard work',
      'Paint touch-ups, patching or any repair work',
      'Hauling away furniture or leftover belongings',
      'Garage floor degreasing — a sweep-out is an add-on',
    ],
    houstonNote:
      'Plenty of Houston-area leases require a professional clean before move-out, and inspectors here reliably check inside the oven, the fridge seals and the window tracks. Those are exactly the places this service is built around.',
  },
  {
    key: 'AIRBNB',
    slug: 'airbnb-turnover-cleaning',
    name: 'Airbnb / Rental Turnover',
    tagline: 'A same-day reset between guests, with photo proof the place was left right.',
    summary:
      'A fast, checklist-driven turnover built for short-term rentals: the property reset and staged for the next guest, linens changed, consumables restocked from your supplies, and before-and-after photos of every room sent through so you can see the state it was left in without driving over.',
    bestFor: [
      'Short-term rental hosts managing remotely',
      'Same-day checkout-to-check-in windows',
      'Hosts who have been burned by a turnover nobody can verify',
      'Property managers running several units',
    ],
    cadence: 'Per turnover, as often as your calendar needs',
    typicalLength: 'Sized to your checkout-to-check-in window',
    includes: [
      {
        area: 'Reset and stage',
        items: [
          'All bed linens stripped and changed, beds staged hotel-style',
          'Fresh towels folded and set out in every bathroom',
          'Laundry started on site where a machine is available',
          'Furniture and décor returned to their photographed positions',
        ],
      },
      {
        area: 'Kitchen',
        items: [
          'Dishwasher emptied or run, dishes put away',
          'Refrigerator cleared of anything guests left behind',
          'Counters, sink, stovetop and appliance fronts cleaned',
          'Coffee, filters and consumables restocked from your supplies',
          'Trash and recycling taken out',
        ],
      },
      {
        area: 'Bathrooms and living areas',
        items: [
          'Toilets, showers, sinks and mirrors reset',
          'Paper goods, soap and amenities restocked from your supplies',
          'Floors vacuumed and mopped throughout',
          'Surfaces dusted and high-touch points wiped',
        ],
      },
      {
        area: 'Reporting',
        items: [
          'Before-and-after photos of every room, room by room',
          'Anything damaged, missing or left behind flagged with a photo',
          'Low-stock consumables noted before you run out',
        ],
      },
    ],
    notIncluded: [
      'Providing linens, towels or consumables — we use what you stock',
      'Guest communication, key handover or lockbox management',
      'Deep cleaning or carpet treatment — book those separately',
      'Maintenance, repairs or assembling furniture',
      'Hauling away items guests abandoned',
    ],
    houstonNote:
      'Turnover demand in this market spikes hard around the Energy Corridor work calendar, Medical Center rotations, rodeo season and home game weekends — the windows where a missed turnover costs a booking.',
  },
];

export function getService(slug: string): ServiceContent | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

export function serviceByKey(key: string): ServiceContent | undefined {
  return SERVICES.find((s) => s.key === key);
}

export function serviceSlugs(): string[] {
  return SERVICES.map((s) => s.slug);
}
