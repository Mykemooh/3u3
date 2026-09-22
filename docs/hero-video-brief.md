# 3U3 Cleaning — hero film brief

Everything needed to produce the landing-page backdrop, whether it's shot
with a camera or generated with a video tool.

Drop the finished file at `public/videos/hero.mp4` and a still frame at
`public/videos/hero-poster.jpg`, commit, and the hero turns the backdrop on
by itself. No code change. Until those files exist the hero stays a clean
white composition, which is a perfectly good place to launch from.

---

## The story, in one line

Three cleaners arrive, are welcomed in, work through the home, leave — and
the homeowner walks back into a house that feels different.

Quiet and unhurried. Nobody rushes, nobody mugs at the camera. The feeling
to aim for is *relief*, not *hustle*.

---

## Shot list

Eight shots, roughly 3 seconds each, cutting to about 20–24 seconds total.
It loops, so the last frame needs to sit comfortably next to the first.

| # | Shot | Duration | Notes |
|---|---|---|---|
| 1 | Three cleaners walk up a front path toward the door, caddies in hand | 3s | Shot from behind and slightly low. Branded polos readable but not centred. Morning light |
| 2 | Front door opens, homeowner greets them warmly | 3s | Real warmth, a genuine smile. No handshake choreography |
| 3 | Wide of the team fanning out into the home | 2s | Establishes three people working as a unit |
| 4 | Bathroom — glass or chrome being wiped to a shine | 3s | Close. Watch for the reflection of the crew or camera in the glass |
| 5 | Kitchen — counter being wiped, then a slow reveal of the finished surface | 3s | The gold accent of the brand reads nicely against stone or quartz |
| 6 | Dusting a shelf or ledge, sunlight catching the surface | 3s | Slight slow motion works well here |
| 7 | The three walk back out, door closing gently behind them | 3s | Mirrors shot 1, which helps the loop |
| 8 | Homeowner walks into the finished room, pauses, breathes | 3–4s | The payoff shot. Sell it with stillness, not a grin. End on the room, not the face — this is the frame that loops back to shot 1 |

---

## How it has to look to work as a backdrop

This footage sits *behind* white text on a white page, under a white veil.
That changes what makes a good shot:

- **Bright, airy, low contrast.** Dark or busy footage fights the type.
- **Keep the centre calm.** The logo, headline and buttons sit dead centre.
  Action belongs in the outer thirds.
- **Slow movement only.** Gentle push-ins and slow pans. Fast cuts behind
  text read as a glitch.
- **No on-screen text, no logos composited in.** The real logo sits on top.
- **No audio needed.** It plays muted and the audio track gets stripped.

---

## Delivery specs

Shoot or generate in 4K. Do **not** put a 4K file on the web page — a phone
on cellular would pay for every one of those pixels to sit blurred behind a
white veil. Master high, deliver small:

| | |
|---|---|
| Master | 3840×2160, 24 or 30fps |
| Web file | 1920×1080, H.264 MP4, no audio |
| Target size | Under 4 MB. Under 2.5 MB is better |
| Length | 20–24s, loops cleanly |
| Poster | A bright frame from shot 8, JPEG, ~1920px wide, under 200 KB |

Once you have the 4K master, this produces the web file and poster:

```bash
# Web video: 1080p, no audio, tuned for streaming
ffmpeg -i master-4k.mov \
  -vf "scale=1920:-2" -an \
  -vcodec libx264 -crf 28 -preset slow \
  -movflags +faststart -pix_fmt yuv420p \
  public/videos/hero.mp4

# Poster frame, taken at 18 seconds
ffmpeg -i master-4k.mov -ss 00:00:18 -vframes 1 -vf "scale=1920:-2" -q:v 4 \
  public/videos/hero-poster.jpg
```

Check the result is under 4 MB (`ls -lh public/videos/hero.mp4`). If it
isn't, raise `-crf` to 30 or 32 — behind a white veil the quality loss is
invisible, and the page speed is not.

---

## If you're generating this rather than filming it

Shot 8 is the one worth the most attention and the hardest to fake — a
person breathing in a clean room. If any shot ends up uncanny, cut it
rather than ship it; seven good shots beat eight with one wrong.

A prompt per shot, using shot 1 as the pattern:

> Cinematic, bright, airy. Three professional house cleaners in matching
> navy polo shirts walk up a suburban front path carrying cleaning caddies.
> Filmed from behind at waist height, morning light, shallow depth of field,
> slow steady forward movement. Warm, calm, unhurried. No text, no logos.

Two cautions: a video tool will invent a logo on those polos if you let it,
so say "plain polo shirts, no text" and plan to have the real branding only
on clothing you actually own; and generated people in service uniforms can
drift into stereotype, so review the casting in what comes back.

---

## The honest alternative

Real footage of your actual crew, in your actual polos, in a real customer's
home, will outperform anything generated — for a local family business it
*is* the pitch. Shot on a recent phone in good window light, with a cheap
gimbal, this is a two-hour shoot. Worth considering once your first hire
starts and you have a customer happy to be filmed. Get that permission in
writing before you shoot inside someone's home.
