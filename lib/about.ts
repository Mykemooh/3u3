/**
 * The About copy, in one place.
 *
 * The home page shows a short teaser and /about shows the whole thing, and
 * both read from here so the two can never drift apart. Kept as plain
 * strings rather than JSX so apostrophes stay ordinary apostrophes.
 */

export const ABOUT_INTRO: string[] = [
  "3U3 started the way most family businesses do — around a kitchen table, after the boys were finally asleep, with a notebook and a good deal more nerve than certainty.",
  "We're parents of three young boys, raising them in Katy, just west of Houston. So we know exactly what a house looks like at six o'clock on a Tuesday: backpacks by the door, a sink that didn't get done, laundry that's been almost folded since Sunday. We're not here to clean showhomes. We clean homes like ours — lived in, loved in, and honestly a little behind.",
];

export type Pillar = {
  /** The F itself. */
  word: string;
  /** A plain-language line under the word, so the F never stands alone. */
  heading: string;
  body: string;
};

/**
 * Three Fs. Each one is written as something you could hold us to, not as a
 * value statement — a promise you can check is more use to a customer than
 * an adjective.
 */
export const PILLARS: Pillar[] = [
  {
    word: 'Faith',
    heading: 'We started on belief, long before proof',
    body: "We began this with no customers and no guarantee, on little more than the conviction that honest work, done properly, finds its people. That belief is why we price at your door instead of guessing from a form, why we will tell you a room doesn't need the deep clean you asked for, and why we don't take a cent before we've earned it. Anyone can say they'll do right by you. We'd rather you just watch us do it.",
  },
  {
    word: 'Family',
    heading: "It's our name on it, and our family's word behind it",
    body: "Family business isn't a slogan here, it's the whole structure. That changes who we hire — nobody joins this crew we wouldn't hand our own front-door key to — and it changes how we work once we're inside. Your kitchen is where your family eats. Your kids' rooms hold their entire world. We look after all of it the way we'd want somebody looking after ours, on a week when we couldn't get to it ourselves.",
  },
  {
    word: 'Future',
    heading: "We're building something meant to outlast us",
    body: "This isn't a side hustle and it isn't something to flip. It's a business our boys could take over one day if they ever want it, and steady, respected work for every cleaner who builds it with us. That's a long game, and it's only ever won one house at a time. Every home that stays with us is another brick in it — which is why we'd rather keep you for ten years than win you for one clean.",
  },
];

export const ABOUT_CLOSING =
  "If those sound like the people you'd want in your home, start with a free walkthrough. We come out, look at the actual house, tell you honestly what it needs, and give you a price on the spot.";

/** The shorter version, for the block on the home page. */
export const ABOUT_TEASER =
  "We're parents of three young boys, raising them in Katy and building this business around them. It runs on three things: faith that honest work finds its people, family — ours and yours — and a future worth handing on.";
