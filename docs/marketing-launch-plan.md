# Sayzo Launch Plan — 3-Week Paid Video Test

A 3-week paid short-form video test on TikTok and Instagram Reels to find out whether paid video is a viable acquisition channel for Sayzo. The sprint is structured as three one-week passes with a weekend checkpoint between each — so you can read the data, pivot, and reinvest before committing the next chunk of budget. Total budget is PHP 15,000 across 8 videos plus a PHP 3,000 reserve for reallocation to the winning concept. Every video is a 15-second relatable workplace moment (meme-flavored) ending with a 3-second Sayzo brand card. By day 22 you'll have a clean call on whether to scale, iterate, or kill this channel.

This is your sprint — own the prep, the execution, the weekly reviews, and the final call.

---

## Prep work — do this before day 1

- [ ] **Build the 4 landing pages**, one per angle, each mapped to the concepts below. Each echoes the angle's pain, then hands off to the main sayzo.com pitch. UTMs must parse and flow into signup records.
    - `/standup` — Concept 1 (Standup Freeze)
    - `/meetings` — Concept 2 (Mute Button Regret)
    - `/clients` — Concept 3 (3 AM Client Call)
    - `/career` — Concepts 4 & 5 (Over-Rehearsed Answer, Performance Review Undersell)
- [ ] **Wire retention tracking** so every signup records: first-drill timestamp, second session in ≤14 days (≥24h after the first), desktop companion install, 10-drill cap hit. These are the validation signals — without them the readout is vanity.
- [ ] **Decide the "someone wants to pay" path.** Sayzo has no productized checkout yet, so if a user hits the 10-drill cap and asks for more, handle it manually (email + Stripe link, or manual entitlement grant). Write the one-sentence playbook before day 1 so no one is improvising on a live signup.
- [ ] **Stand up the tracking sheet** (columns in the *Tracking* section below).
- [ ] **Set up ad accounts** on TikTok and Meta, with daily caps.
- [ ] **Subscribe to Kling and ElevenLabs.** See *Tools*.
- [ ] **Spend 20 minutes using Sayzo yourself** — run two drills, install the desktop companion, watch a drill generated from a real meeting. You can't market it without feeling it.
- [ ] **Pre-produce the week 1 videos end-to-end** before day 1. The first videos reveal what the production workflow really is — lock it before you're on the clock.

---

## What Sayzo is

Sayzo is a communication coaching app for non-native English speakers working at US, EU, and global companies. Users sign up at sayzo.com, run short speaking drills in the browser, and install a desktop companion that sits in on their real work meetings — standups, client calls, 1:1s, interviews. From those meetings, Sayzo generates personalized drills on the exact moments where the user's point didn't land.

**The differentiator**: drills are generated from your actual meetings, not a textbook.

**What Sayzo is *not*** — don't confuse it with these in copy:
- Not Duolingo (gamified, generic)
- Not Cambly or a tutor (scheduled lessons, generic curriculum)
- Not Granola or Otter (notetakers — they give you a transcript, Sayzo gives you coaching)

Free tier: 10 drills, no credit card.

---

## Why this sprint exists

This experiment exists to gate a bigger decision: **should we invest the engineering and business time to integrate a payment provider?** Onboarding with Stripe (or PayMongo, or similar) is real work — setup, compliance paperwork, webhook plumbing, an ongoing relationship — and it's the wrong thing to sink time into for a product that hasn't shown any pull.

So rather than approach a payment provider on a hunch and risk building checkout for a dead idea, we use this sprint as the signal:

- **Engagement shows up** (users return, install the companion, hit the 10-drill cap) → green light. Start the payment-provider integration for sprint 2.
- **Engagement doesn't show up** → don't approach a provider yet. The bottleneck isn't checkout, it's fit or activation. Fix those first.

The PHP 15K here is the cost of *not* guessing.

---

## The one question this test answers

**Does paid short-form video acquire genuinely engaged trials from Filipinos working remote for US/EU companies — at a cost that makes sense for Sayzo?**

"Genuinely engaged" means *second session ≥24h after the first* at minimum, and ideally *companion install* or *10-drill cap hit*. A signup that does one drill and never returns doesn't count as validation of anything except that the video got a click.

Secondary questions (useful but not decision-weight): which angle pulls hardest, TikTok vs Instagram at equal spend, does meme-format work for this audience, does execution matter more than concept.

Don't let "we learned a lot" substitute for a clear call at day 22. The whole point is to make a real decision.

---

## Positioning & rules (non-negotiable)

1. **Never say "AI"** in the video, voiceover, captions, or landing page.
2. **Target**: Filipinos working remote for US/EU companies, ages 25–40.
3. **Lead with a relatable workplace moment.** No product demo in the video — only the CTA end-card.
4. **Max 15 seconds per video.**
5. **Every video ends on the same CTA end-card**: Sayzo logo · "Coaching from your real meetings." · `sayzo.com`
6. **Variants of a concept must stay close** — same script, regenerated with a different actor or setting. If variant B changes the script or concept, it's a new concept, not a variant.

---

## Language

**English only** for this sprint. Mixing Tagalog/Taglish mid-sprint muddies the concept-vs-execution signal. Test Tagalog in a follow-up sprint if English performs.

---

## Budget

- **Total ad spend**: PHP 15,000 (~USD 260)
- **Per video**: PHP 1,500 = PHP 750 TikTok + PHP 750 Instagram
- **Boost window**: 3 days per video
- **Structure**: 2 + 3 + 3 = 8 videos across 3 weeks, plus PHP 3,000 reserve
- **Week 1**: PHP 3,000 (2 videos) — diagnostic
- **Week 2**: PHP 4,500 (3 videos) — breadth
- **Week 3**: PHP 4,500 (3 videos) + PHP 3,000 winner reallocation
- Tool subscriptions (Kling, ElevenLabs) are separate from ad spend.

---

## Tools

**Kling** for video generation. **ElevenLabs** for voiceover (neutral Filipino-accented English voice). Use any editor you like for stitching clips, laying voice, adding subtitles, and appending the CTA end-card. The first videos will show you what the workflow needs to look like.

---

## Posting schedule

The sprint is three weekly passes. Each week ends with a weekend checkpoint before the next week's spend is committed. Week 1 tests two different angles to confirm the funnel works end-to-end. Week 2 covers the remaining three angles. Week 3 doubles down on the winners with execution variants, and the PHP 3K reserve is reallocated to the best-performing video.

| Day | Action |
|-----|--------|
| **Week 1 — diagnostic** | |
| 1 | Post V1a · Standup Freeze · boost 1–3 |
| 4 | Post V3a · 3 AM Client Call · boost 4–6 |
| 7 | **Weekend 1 checkpoint** — go/no-go on funnel |
| **Week 2 — breadth** | |
| 8 | Post V2a · Mute Button Regret · boost 8–10 |
| 10 | Post V4a · Over-Rehearsed Answer · boost 10–12 |
| 12 | Post V5a · Performance Review Undersell · boost 12–14 |
| 14 | **Weekend 2 checkpoint** — identify winning angle/concept |
| **Week 3 — scale winners** | |
| 15 | Post V_b · variant B of week 2's top concept · boost 15–17 |
| 17 | Post V_c · a second execution of the winner (new actor/setting) · boost 17–19 |
| 19 | Post V_wildcard · variant B of a runner-up OR a new hook on the winner · boost 19–21 |
| 19–21 | Reallocate the PHP 3K reserve to the best-performing week-3 video |
| 22 | **Final readout** |

**Post time**: 7 PM Philippines Time. Same file goes to both TikTok and Instagram Reels.

Week-3 video selection is deliberately left open — it depends on what week 2 reveals. The plan is *variants of the winning concept*, not three fresh ideas. If everything ties, default to variant B of the concept with the most signups.

---

## The 5 concepts (with prompts)

Each concept has a variant A (the prompt as written) and a variant B (same script, regenerated with a small twist in actor or setting). Variants test execution within a concept — not two different concepts. Not every concept gets both variants in this sprint; variant B usage depends on week 2 findings.

Every video is 15 seconds: ~12 seconds of scene + 3-second CTA end-card.

---

### Concept 1 — "The Standup Freeze" · angle: standup · landing: /standup

**Hook**: Boss calls on you in standup. Brain goes blank. You mumble filler.

**Prompt (variant A)**:
> 12-second realistic scene. Handheld, over-the-shoulder shot of a Filipino man in his late 20s sitting at a cluttered home-office desk, morning light through the blinds, laptop open to a Zoom standup with six video tiles. His manager's voice through the laptop: "Alright, Mike — what've you been up to?" Cut to a close-up of his face. His eyes widen slightly. Two full seconds of silence. He opens his mouth and says quietly, "Uh... I — just been working on... some things. Yeah. It's going." He blinks, defeated. Natural room tone, no music, no text overlays. End on his frozen face.

**Variant B twist**: Filipino woman, late 20s, at a kitchen counter with laptop on a cereal box. Same script, same ending.

---

### Concept 2 — "The Mute Button Regret" · angle: meetings · landing: /meetings

**Hook**: You had the perfect response. You were muted. Conversation moves on.

**Prompt (variant A)**:
> 12-second realistic scene in a small bedroom converted to a home office. A Filipino woman, 30, in a hoodie, laptop open to a Zoom call with eight people. She leans into the mic and says with energy, "Actually, I think the reason the numbers dropped is —" The Zoom UI on screen shows a red "Muted" icon blinking. The call's audio continues: "Okay great, let's move on." She freezes mid-sentence. Pulls back from the mic. Stares at the screen. Puts her face in her hands. Dim natural lighting. Ambient room sound, no music.

**Variant B twist**: Filipino man, mid-30s, in a co-working cafe with headphones on. Same script, same ending.

---

### Concept 3 — "The 3 AM Client Call" · angle: clients · landing: /clients

**Hook**: You're in pajamas, 3 AM, coffee in hand. About to join a call with fresh, loud Americans.

**Prompt (variant A)**:
> 12-second scene. Dark bedroom, Manila skyline visible through a window, clock reads 2:57 AM. A Filipino man, 31, in an oversized shirt and pajama shorts, hair messy, holding a mug of instant coffee. He sits down at a desk lit only by his laptop. The Zoom pre-join screen shows five American coworkers in bright daylight offices, smiling, laughing before the call. The "Join" button hovers. He stares at it. Takes a long, slow sip of coffee. Exhales. Clicks Join. From the speakers, instantly: "HEY MIKE! GOOD MORNING BUDDY, HOW'S IT GOIN'!" He flinches. Holds a weak smile. Ambient night sound, no music.

**Variant B twist**: Filipino woman, late 20s, in a tiny condo, rain against the window instead of skyline. Same beats.

---

### Concept 4 — "The Over-Rehearsed Answer" · angle: interviews · landing: /career

**Hook**: You practiced the answer 50 times. You open your mouth. It falls apart.

**Prompt (variant A)**:
> 12-second scene. Split in two halves. First half (6 seconds): a Filipino woman, 27, in a bathrobe, pacing in a hallway, rehearsing confidently to her phone camera: "So in my previous role, I led a cross-functional team of six to deliver a forty-percent increase in onboarding completion." Crisp, clean, rehearsed. Hard cut. Second half (6 seconds): same woman, now in a blazer, on a Zoom interview, sweating slightly. She says, "So, uh — in my previous role I — we, the team — we did the — the onboarding thing, and it was, uh — forty? Percent? Better." She trails off. The interviewer's silence fills the room. Natural lighting throughout. No music.

**Variant B twist**: Filipino man, early 30s, rehearsing in his car in a parking lot, then disaster inside an on-site interview boardroom. Same script.

---

### Concept 5 — "The Performance Review Undersell" · angle: promotion · landing: /career

**Hook**: Manager asks about your year. You list five huge wins in one breath. Cut to an American coworker spinning one task into a saga.

**Prompt (variant A)**:
> 12-second scene in two halves. First half (6 seconds): Zoom call, a Filipino woman, 29, on a performance review with her manager. Manager: "So — tell me about your year." She smiles tightly and says, fast and flat: "I shipped the new onboarding, fixed the billing bug, led the intern program, wrote the RFC, and covered for Alex for two months." She stops. Hard cut. Second half (6 seconds): same meeting format but with an American man, 30, same job level. Manager: "So — tell me about your year." He leans back, smiles. "Honestly, Karen? It's been a transformative year. I want to walk you through a project I'm really proud of — the Q2 sync migration. This was a story of leadership, of vision —" He's just getting started. Natural lighting, no music.

**Variant B twist**: Filipino man, early 30s, as the underseller; American woman, late 20s, as the over-seller.

---

## Gap worth acknowledging

The landing page surfaces four drill categories, including **1:1s & hard conversations**. This sprint does **not** test that angle — it's reserved for a follow-up sprint so the concept-vs-execution reads here stay clean. If weeks 1–3 show meme-format works at all, 1:1s is the natural first addition for sprint 2.

---

## Per-video cadence

On each posting day: produce the scheduled video, post to TikTok and Instagram Reels at 7 PM PHT with a caption, boost PHP 750 per platform for 3 days with correct UTMs, log the post in the tracking sheet. Update the sheet daily while boosts are running.

### UTM format (don't deviate — attribution depends on this)

`sayzo.com/{landing}?utm_source={tiktok|instagram}&utm_medium=paid-video&utm_campaign={angle}&utm_content={video-id}`

Example for V1a on TikTok: `sayzo.com/standup?utm_source=tiktok&utm_medium=paid-video&utm_campaign=standup&utm_content=v1a`

### Caption bank (pick one, add URL)

- "If you know, you know."
- "Tag someone who's done this."
- "Every. Single. Standup."
- "Non-native speakers at US companies, rise up."
- "Not Duolingo. Not Granola. Coaching from your real meetings." (use sparingly — pitch caption)

---

## Tracking sheet (two tabs)

**Tab 1 — Daily performance** (one row per video per platform per day of boost):
`Date · Video ID · Concept · Variant · Platform · Daily Spend · Views · Clicks · Signups · First drill completed`

**Tab 2 — Engagement** (one row per signup; update continuously, snapshot at each checkpoint):
`Signup date · Source video · utm_campaign · utm_content · First drill completed date · Second session in ≤14 days (≥24h gap)? · Desktop companion installed? · 10-drill cap hit? · Manual paid upgrade requested?`

Tab 2 is what turns clicks from vanity into a real signal. Don't skip it.

---

## Keeping the team in the loop

Post a short status update to the team channel after each weekend checkpoint — what shipped, current spend/signups/returners, any blocker. The tracking sheet has the detail.

Weekend checkpoint notes and the day-22 readout are shared with the team (spec in *Checkpoints*).

---

## Checkpoints

**Weekend 1 (day 7) — funnel diagnostic.** Two videos, ~PHP 3K spent. Looking for *proof of life*:

- **Zero signups across both V1a and V3a?** Stop. Something is broken upstream — landing pages, targeting, tracking, or the offer itself. Do not commit week 2's PHP 4.5K until the break is fixed.
- **At least one signup, first-drill completed?** Funnel is alive. Proceed to week 2.
- **Strong pull on one angle already?** Note it, but don't over-index on n=2. Week 2 will tell you if it's the angle or the execution.

**Weekend 2 (day 14) — pick the winner.** Five videos in the can, all variant A, one per angle. Looking for *which angle to double down on*:

- **Rank by signups × second-session rate**, not raw views.
- **Clearest winner?** Week 3 runs variants B/C of that concept.
- **Two angles tied?** Do variant B of each in week 3 — that's one execution variant per angle instead of two per one concept. Less statistical power, but honest about the data.
- **One platform clearly outperforming at equal spend** (3× clicks or more on the winner)? Route week 3's spend to a single-platform boost.

**Day 22 — final readout** (1 page, shared with the team):
- Total spend, total signups, total second-session returners, total companion installs, total 10-drill cap hits, any manual paid upgrades.
- Effective cost per engaged trial (second-session returner) · cost per companion install · cost per cap hit.
- Winning concept (rank by cost per engaged trial, not by signups alone).
- Winning platform.
- Within the winner, did variant A vs B/C vary wildly? (High variance = execution matters; low variance = concept matters.)
- Decision: scale / iterate / kill.

---

## Decision rule (day 22)

Since there's no productized checkout, engagement is the validation signal — not paid CAC. The rule is tiered by how strong the engagement signal is.

### Strong validation → scale

- **≥1 user hits the 10-drill cap AND installs the desktop companion**, OR
- **≥5 users have a second session in ≤14 days** (≥24h after the first), AND **cost per engaged trial ≤ PHP 500**.

→ **Scale**: 3× spend on the winning concept for 2 more weeks. Ship checkout before this phase so paid conversion becomes measurable.

### Mixed validation → iterate

- **1–4 second-session returners**, OR
- **Cost per engaged trial PHP 500–1,000**, OR
- **Signups are landing but no second sessions**.

→ **Iterate**: same budget, another 8 videos in the winning concept's style — AND fix the activation gap (why isn't anyone returning?) before scaling. The problem is likely first-drill payoff, not the ads.

### No validation → kill this channel for now

- **Zero second-session returners across the full sprint**, OR
- **Cost per engaged trial > PHP 1,000**.

→ **Kill the channel**: paid short-form video isn't the acquisition problem right now. The issue is either activation (what happens after signup) or fundamental fit. Fix those before more ad spend.

### Note on paid CAC

Paid conversion is intentionally excluded from this rule because there's no checkout — any "paid" number would be noise. If a user manually requests a paid upgrade during the sprint, that's a strong qualitative signal worth flagging in the readout, but don't try to compute a CAC from it. Build the checkout before sprint 2.
