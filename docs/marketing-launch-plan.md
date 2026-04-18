# Sayzo Launch Plan — 30-Day Paid Video Test

A 30-day paid short-form video test on TikTok and Instagram Reels to find out whether paid video is a viable acquisition channel for Sayzo. You'll post 10 videos (5 concepts × 2 variants), one every 3 days, each boosted for 3 days on both platforms at equal spend. Every video is a 15-second relatable workplace moment (meme-flavored) ending with a 3-second Sayzo brand card. By day 31 you'll have a clean yes/no on whether to scale, iterate, or kill this channel.

This is your sprint. You own the prep, the execution, the reporting, and the final call.

---

## Prep work — do this before day 1

All of it is on you. None of it can be skipped or pushed.

- [ ] **Fill in the economics table** in the *Decision rule* section at the bottom. Don't launch with placeholder numbers — the day-31 call is meaningless without them.
- [ ] **Build the 4 landing pages** (`/s/standup`, `/s/meetings`, `/s/clients`, `/s/career`) with UTM parsing and signup capture. Each echoes the concept's pain at the top, then hands off to the main sayzo.com pitch.
- [ ] **Wire retention tracking** — every signup records: first-drill-completed timestamp, second-drill-in-≤14-days, desktop companion install event, paid conversion. Without this, CAC is vanity.
- [ ] **Create the Google Sheet** (two tabs: *Daily performance* + *Retention*) using the column specs in the *Tracking sheet* section.
- [ ] **Pick and set up the video generator tool** (recommendation in *Tools* below). Expense the subscription to the company.
- [ ] **Set up the ad accounts**: TikTok Business + Ads Manager, Meta Business Suite + Ads Manager. Add payment methods. Set daily caps so nothing can overspend.
- [ ] **Consolidate brand assets** in the Drive folder (folder structure below): logo PNG + vector, brand colors in hex, font, subtitle style reference.
- [ ] **Spend 20 minutes using Sayzo yourself**. Sign in, run two drills, install the desktop companion, watch a drill get generated from a real meeting. You can't market this without feeling it.
- [ ] **Pre-produce V1a and V2a** before day 1 so the launch doesn't slip if the generator has a bad day.
- [ ] **Dry-run a PHP 100 boost** on a test post to confirm UTM → signup → tracking sheet works end-to-end. If a test signup lands in the Retention tab with UTMs intact, you're clear to launch.

---

## What Sayzo is (product primer)

Sayzo is a communication coaching app for non-native English speakers working at US, EU, and global companies. Users sign up at sayzo.com, run short speaking drills in the browser (one workplace scenario + a mic, with coaching on the response), and install a desktop companion that sits in on their real work meetings — standups, client calls, 1:1s, interviews. From those meetings, Sayzo generates personalized drills on the exact moments where the user's point didn't land.

The differentiator: drills are generated from your actual meetings, not a textbook.

**What Sayzo is *not*** — don't confuse it with these in copy:
- Not Duolingo (gamified, generic)
- Not Cambly or a tutor (scheduled lessons, generic curriculum)
- Not Granola or Otter (notetakers — they give you a transcript, Sayzo gives you coaching)

Free tier: 10 drills, no credit card.

---

## The one question this test answers

**Does paid short-form video acquire trials from Filipinos working remote for US/EU companies at a CAC that's viable for Sayzo?**

Secondary questions (useful but not decision-weight):
- Which of the 5 angles pulls hardest?
- TikTok vs Instagram at equal spend?
- Does meme-format creative work for this audience?

Don't let "we learned a lot" substitute for a clear yes/no at day 31. The whole point is to make a real decision.

---

## Positioning & rules (non-negotiable)

1. **Never say "AI"** in the video, voiceover, captions, or landing page.
2. **Target**: Filipinos working remote for US/EU companies, ages 25–40.
3. **Lead with a relatable workplace moment.** No product demo in the video — only the CTA end-card.
4. **Max 15 seconds per video.**
5. **Every video ends on the same CTA end-card**: Sayzo logo · "Coaching from your real meetings." · `sayzo.com`
6. **Variants of a concept must stay close** — same script, regenerated with a different actor or setting. If variant B changes the script or concept, it's a new concept, not a variant.
7. **Competitor framing** (if a caption needs to punch): "Not Duolingo. Not Granola. Coaching from your real meetings."

---

## Language

**English only** for this sprint. Captions in English, voiceover in English. The target audience works in English-speaking environments.

(Rationale for keeping it tight: mixing Tagalog/Taglish into some videos mid-sprint would muddy the concept-vs-execution signal. Test Tagalog captions in a follow-up sprint if the English version performs.)

---

## Budget

- **Total ad spend**: PHP 15,000 (~USD 260)
- **Per video**: PHP 1,500 = PHP 750 TikTok + PHP 750 Instagram
- **Boost window**: 3 days per video
- **Tool budget**: separate from ad spend — see *Tools* below
- **Structure**: 5 concepts × 2 variants = 10 videos

---

## Tools

Default stack:

- **Video generation**: Sora (OpenAI) or Veo 3 (Google). Both produce video + audio in one pass, which matches how the prompts in this doc are written. If you pick Runway Act-Two, HeyGen, or Hedra instead, you'll need to reformat prompts and may need separate voiceover (ElevenLabs).
- **Voiceover (if the generator doesn't include it)**: ElevenLabs. Use a neutral Filipino-accented English voice.
- **Editing**: CapCut (free).
- **Screen capture (not needed for these 10 videos, but handy for troubleshooting)**: QuickTime.

---

## File organization

All working files live in the shared Drive folder:

```
/Sayzo Launch Sprint/
  01-Brand-assets/          (logo, colors, fonts, subtitle style reference)
  02-Source-videos/         (raw generator output before editing)
  03-Final-videos/          (with CTA end-card, subtitles, ready to post)
  04-Prompts-and-captions/  (log of every prompt sent to generator + caption used)
  05-Reports/               (day 16 midpoint, day 31 readout)
```

**Video file naming**: `V{concept}{variant}_{YYYYMMDD}.mp4` — e.g., `V1a_20260501.mp4`, `V3b_20260522.mp4`.

---

## Posting schedule

Pass 1 runs variant A of all 5 concepts (days 1–15). Pass 2 runs variant B (days 16–30). Variants of the same concept never compete head-to-head.

| Day | Action |
|-----|--------|
| 1 | Post V1a · Standup Freeze · boost 1–3 |
| 4 | Post V2a · Mute Button Regret · boost 4–6 |
| 7 | Post V3a · 3 AM Client Call · boost 7–9 |
| 10 | Post V4a · Over-Rehearsed Answer · boost 10–12 |
| 13 | Post V5a · Performance Review Undersell · boost 13–15 |
| 16 | Post V1b · boost 16–18 · **MIDPOINT CHECKPOINT** |
| 19 | Post V2b · boost 19–21 |
| 22 | Post V3b · boost 22–24 |
| 25 | Post V4b · boost 25–27 |
| 28 | Post V5b · boost 28–30 |
| 31 | Readout |

**Post time**: 7 PM Philippines Time (PHT = UTC+8). Same file goes to both TikTok and Instagram Reels.

---

## The 5 concepts (with prompts)

Each concept has a variant A (the prompt as written) and a variant B (same script, regenerated with a small twist). Variants test execution within a concept — not two different concepts.

Every video is 15 seconds: ~12 seconds of scene + 3-second CTA end-card.

---

### Concept 1 — "The Standup Freeze" · angle: standup · landing: `/s/standup`

**Hook**: Boss calls on you in standup. Brain goes blank. You mumble filler.

**Prompt (variant A)**:
> 12-second realistic scene. Handheld, over-the-shoulder shot of a Filipino man in his late 20s sitting at a cluttered home-office desk, morning light through the blinds, laptop open to a Zoom standup with six video tiles. His manager's voice through the laptop: "Alright, Mike — what've you been up to?" Cut to a close-up of his face. His eyes widen slightly. Two full seconds of silence. He opens his mouth and says quietly, "Uh... I — just been working on... some things. Yeah. It's going." He blinks, defeated. Natural room tone, no music, no text overlays. End on his frozen face.

**Variant B twist**: Regenerate with a Filipino woman, late 20s, at a kitchen counter with her laptop propped on a cereal box. Same script, same ending.

---

### Concept 2 — "The Mute Button Regret" · angle: meetings · landing: `/s/meetings`

**Hook**: You had the perfect response. You were muted. Conversation moves on.

**Prompt (variant A)**:
> 12-second realistic scene in a small bedroom converted to a home office. A Filipino woman, 30, in a hoodie, laptop open to a Zoom call with eight people. She leans into the mic and says with energy, "Actually, I think the reason the numbers dropped is —" The Zoom UI on screen shows a red "Muted" icon blinking. The call's audio continues: "Okay great, let's move on." She freezes mid-sentence. Pulls back from the mic. Stares at the screen. Puts her face in her hands. Dim natural lighting. Ambient room sound, no music.

**Variant B twist**: Regenerate with a Filipino man, mid-30s, in a co-working cafe with headphones on. Same script, same ending.

---

### Concept 3 — "The 3 AM Client Call" · angle: clients · landing: `/s/clients`

**Hook**: You're in pajamas, 3 AM, coffee in hand. About to join a call with fresh, loud Americans.

**Prompt (variant A)**:
> 12-second scene. Dark bedroom, Manila skyline visible through a window, clock reads 2:57 AM. A Filipino man, 31, in an oversized shirt and pajama shorts, hair messy, holding a mug of instant coffee. He sits down at a desk lit only by his laptop. The Zoom pre-join screen shows five American coworkers in bright daylight offices, smiling, laughing before the call. The "Join" button hovers. He stares at it. Takes a long, slow sip of coffee. Exhales. Clicks Join. From the speakers, instantly: "HEY MIKE! GOOD MORNING BUDDY, HOW'S IT GOIN'!" He flinches. Holds a weak smile. Ambient night sound, no music.

**Variant B twist**: Regenerate with a Filipino woman, late 20s, in a tiny condo, rain against the window instead of skyline. Same beats.

---

### Concept 4 — "The Over-Rehearsed Answer" · angle: interviews · landing: `/s/career`

**Hook**: You practiced the answer 50 times. You open your mouth. It falls apart.

**Prompt (variant A)**:
> 12-second scene. Split in two halves. First half (6 seconds): a Filipino woman, 27, in a bathrobe, pacing in a hallway, rehearsing confidently to her phone camera: "So in my previous role, I led a cross-functional team of six to deliver a forty-percent increase in onboarding completion." Crisp, clean, rehearsed. Hard cut. Second half (6 seconds): same woman, now in a blazer, on a Zoom interview, sweating slightly. She says, "So, uh — in my previous role I — we, the team — we did the — the onboarding thing, and it was, uh — forty? Percent? Better." She trails off. The interviewer's silence fills the room. Natural lighting throughout. No music.

**Variant B twist**: Regenerate with a Filipino man, early 30s, rehearsing in his car in a parking lot, then disaster inside an on-site interview boardroom. Same script.

---

### Concept 5 — "The Performance Review Undersell" · angle: promotion · landing: `/s/career`

**Hook**: Manager asks about your year. You list five huge wins in one breath. Cut to an American coworker spinning one task into a saga.

**Prompt (variant A)**:
> 12-second scene in two halves. First half (6 seconds): Zoom call, a Filipino woman, 29, on a performance review with her manager. Manager: "So — tell me about your year." She smiles tightly and says, fast and flat: "I shipped the new onboarding, fixed the billing bug, led the intern program, wrote the RFC, and covered for Alex for two months." She stops. Hard cut. Second half (6 seconds): same meeting format but with an American man, 30, same job level. Manager: "So — tell me about your year." He leans back, smiles. "Honestly, Karen? It's been a transformative year. I want to walk you through a project I'm really proud of — the Q2 sync migration. This was a story of leadership, of vision —" He's just getting started. Natural lighting, no music.

**Variant B twist**: Regenerate with a Filipino man, early 30s, as the underseller and an American woman, late 20s, as the over-seller.

---

## Per-video routine (each posting day)

1. Pick the next video from the schedule.
2. Paste the prompt (variant A, or variant B twist) into the generator. Regenerate until it feels right. Log what worked in `04-Prompts-and-captions/`.
3. Append the 3-second CTA end-card.
4. Add subtitles to all dialogue. Use the brand subtitle style (reference in `01-Brand-assets/`).
5. Save the final file to `03-Final-videos/` using the naming convention.
6. Post to TikTok and Instagram Reels at 7 PM PHT with a caption from the bank below. Include the landing page URL at the end of the caption.
7. Boost: PHP 750 TikTok + PHP 750 Instagram, each over 3 days. Set UTMs in the destination URL.
8. Log the post in Tab 1 of the tracking sheet.

**Between posting days**: update Tab 1 daily for any active boost. Check Tab 2 (Retention) on days 15 and 30.

### UTM format

`sayzo.com/s/{landing}?utm_source={tiktok|instagram}&utm_medium=paid-video&utm_campaign={concept-angle}&utm_content={video-id}`

Example for V1a on TikTok: `sayzo.com/s/standup?utm_source=tiktok&utm_medium=paid-video&utm_campaign=standup&utm_content=v1a`

### Caption bank (pick one, add URL at the end)

- "If you know, you know."
- "Tag someone who's done this."
- "Why do we do this to ourselves."
- "Every. Single. Standup."
- "Non-native speakers at US companies, rise up."
- "This is the content."
- "Don't look at me like that."
- "Not Duolingo. Not Granola. Coaching from your real meetings." (use sparingly — it's the "pitch" caption, not every video needs it)

---

## Tracking sheet (two tabs)

**Tab 1 — Daily performance** (one row per video per platform per day of boost):
`Date · Video ID (V1a…V5b) · Concept · Variant · Platform · Daily Spend · Views · Clicks · Signups · First drill completed`

**Tab 2 — Retention** (one row per signup; update on days 15 and 30):
`Signup date · Source video · utm_campaign · utm_content · First drill completed date · Second drill in ≤14 days? · Desktop companion installed? · Paid conversion?`

Tab 2 is what turns CAC from vanity into a real signal. Don't skip it.

---

## Weekly update (Mondays, 5 PM PHT)

Post a 3-bullet status to the team channel:
- What shipped since last update.
- Current spend · signups · week-2 returners (if any).
- Any blocker.

Keep it short. Anyone who wants deeper numbers can read the tracking sheet.

---

## Checkpoints

**Day 16 — midpoint** (all variant A done; variant B pass starting):
- **One platform clearly outperforming** at equal spend (3× clicks or more)? Reallocate remaining budget to a single-platform boost (PHP 1,500 on the winner per video for V2b–V5b).
- **One concept looks dead** across both platforms (0 signups from V_a)? Keep V_b anyway — the whole point of variants is distinguishing concept from execution.
- **Zero signups across *all* V_a videos?** Stop. Something is broken upstream — landing pages, targeting, or tracking. Diagnose before spending more.

Write a short midpoint note to the team channel summarizing what you saw and what you're changing.

**Day 31 — final readout** (1 page in `05-Reports/`, shared with the team):
- Total spend, total trials, total week-2 returners, total companion installs, paid conversions.
- CAC per trial · CAC per week-2 returner · CAC per install.
- Winning concept (rank by CAC per returner, not CAC per signup — that's vanity).
- Winning platform.
- Within each concept, did variant A vs B vary wildly? (High variance = execution matters; low variance = concept matters.)
- Decision: scale / iterate / kill.

---

## Decision rule (day 31)

### Economics (fill in during prep)

| Field | Value |
|-------|-------|
| Sayzo LTV (estimate, 12-month) | PHP _______ |
| Trial → paid conversion rate | _______ % |
| Target LTV:CAC ratio | 3:1 (default — adjust if desired) |
| **Max viable CAC per paying user** | = LTV ÷ ratio → PHP _______ |
| **Max viable CAC per trial** | = max-CAC-per-paying × trial-to-paid rate → PHP _______ |

### Rule

- **CAC per trial ≤ (max viable CAC per trial)** AND **≥ 20% of trials complete a second drill within 14 days** → **scale**: 3× spend on the winning concept for 2 more weeks.
- **CAC within ~1.5× max** OR **retention 10–20%** → **iterate**: same budget, 10 more videos in the winning concept's style, AND fix second-drill onboarding before scaling.
- **CAC > 2× max** OR **retention < 10%** → **kill the channel for now**: the problem isn't acquisition, it's activation/retention. Fix those before more ad spend.
