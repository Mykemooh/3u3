# TRASHCAN photography briefs

Every slot on the marketing site shows a labelled placeholder until its photo is added. Direction for all of them (guide §8): real commercial photography, never stock poses; natural daylight; documentary framing; real homes; black TRASHCAN polos are fine on crew; wide environmental frames when people are working.

To add one: save it to `public/images/trashcan/<slot>.jpg` (2400px on the long side, under 500 KB as WebP/JPEG), then set `file: '/images/trashcan/<slot>.jpg'` for that slot in `lib/tc/images.ts`.

| Slot | Where it shows | Shape | Brief |
|---|---|---|---|
| `crew-arrival` | Home → crew section | 16:10 landscape | Two or three cleaners in black polos walking up a Texas suburban driveway with caddies and a vacuum, late-morning daylight, one checking a phone. The house and the walk matter more than faces. |
| `founders` | Home → "Built inside a real cleaning company" | 3:2 landscape | Betty and Mike at home or by their work vehicle — warm daylight, not a studio portrait. |
| `team-huddle` | Features → Run the team | 4:3 | An owner and three cleaners by a van or garage in the morning, owner holding a phone showing the day's route, mid-conversation. |
| `owner-office` | Reserved (resources/pricing refresh) | 3:2 | Owner at a kitchen table in morning light, laptop open to the dashboard, phone face-up, coffee. Over-the-shoulder, the person is the subject. |
| `kitchen-finish` | Reserved | 4:5 portrait | A real, lived-in kitchen just after a clean; a cleaner's hand photographing the counter at the frame edge. |
| `phone-in-hand` | Reserved | 1:1 | Close crop of a hand holding a phone showing the room checklist, bathroom or hallway soft behind. |

Product pictures (the dashboard, crew phone, quote, schedule, invoice and reports vignettes) are drawn in HTML from `components/tc/Mockups.tsx` and need no photography. Their numbers are sample data and are labelled as such.
