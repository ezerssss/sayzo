# Conversations UI Spec

> **Update:** Standalone drills were removed. Conversations are now the home
> tab and live at `/app/conversations`; the practice action is **Replay**
> (`/app/replays/[id]`). See `docs/capture-replay.md`. Some implementation
> notes below predate that routing and may be stale.

**Status:** Shipped (v1). See `components/conversations/` for the UI components. The signed-in home opens on the "Conversations" tab. Detail view shows transcript with inline teachable-moment and native-speaker-rewrite highlights, full analysis with collapsible dimensional cards (three-part CoachingMoment shape), audio playback, and a "Replay this conversation" button that creates a replay with comparison-aware analysis.

---

## Naming

The backend / spec calls these "captures" because that matches the desktop agent's terminology (the agent "captures" real conversations). For the UI, **"captures" is too technical** and reads like an internal feature name. Use:

- **Conversations** — primary user-facing term for captured real conversations
- **Conversation** (singular) — for individual entries
- **Drill** — kept distinct, refers to practice sessions (existing term)

The UI surfaces two separate things:
- **Drills** — practice sessions (existing — `app/page.tsx` etc.)
- **Conversations** — real captured conversations (new)

If the user prefers a different name, the only place it surfaces is in routes / labels / page titles — the backend collection stays `captures`.

---

## Pages

### 1. Conversations list — `/conversations`

Lists the user's processed conversations, newest first.

**Each row shows:**
- **Title** — `serverTitle` (better, from the deeper LLM analysis), falling back to `title` (the agent's local-LLM title)
- **Date** — `startedAt` formatted relatively ("2 hours ago", "yesterday", "Mar 12")
- **Duration** — `durationSecs` formatted ("12 min", "1h 4m")
- **Status badge** — only show non-`analyzed` states (queued / transcribing / validating / analyzing / profiling) for transparency. `rejected` captures get a "filtered out" badge with `rejectionReason` on hover. `*_failed` states get an error indicator.
- **Optional chips** — small inline indicators of the dominant signals: "3 grammar moments", "high filler rate", "monotone delivery"

**Filters / sorts** (nice to have, not v1):
- Date range
- Status
- Duration range
- Search by title

**Empty state:** "No conversations yet. The Sayzo desktop agent will surface your real meetings and calls here once it picks one up."

**Real-time updates:** Should use Firestore real-time listeners so the user sees status changes as the pipeline progresses (matches how drills already do `processingStage` updates).

---

### 2. Conversation detail — `/conversations/[id]`

#### Header
- Server-generated title (`serverTitle` ?? `title`)
- Date, duration, distinct speaker count (from transcript speaker labels)
- Server-generated summary (`serverSummary` ?? `summary`)
- Status with the same badges as the list

#### Audio playback
- Embedded audio player using a signed URL fetched from the server
- Should support seeking when the user clicks any transcript line (sync the player's currentTime to the line's `start`)
- The audio served is the **original stereo capture** from `audioStoragePath` — the user hears both their own voice and the other speakers (which is what they'd want for replay)

#### Transcript view
- Speaker-tagged, timestamped lines from `serverTranscript` (server-side Deepgram output)
- The **user's lines** visually distinct from others (highlight color, indent, or speaker label) — the user is the focus
- Other speakers labeled as `other_1`, `other_2`, `other_unmic` in the data — UI should show generic labels like "Other speaker" or "Other 1" / "Other 2"
- Each line clickable to seek the audio player to that timestamp
- **Inline highlights for `teachableMoments`** — when hovering a flagged line (`transcriptIdx` matches), show the suggestion + explanation in a tooltip or popover
- **Inline highlights for native speaker rewrites** — if implemented (see "Pending: native speaker rewrite" below), show the rewrite alongside the original turn

#### Analysis sections
The capture analysis is rich — show it in collapsible cards:

- **Overview** — `analysis.overview` (1-2 paragraphs)
- **Main issue** — `analysis.mainIssue` prominently displayed
- **Secondary issues** — `analysis.secondaryIssues` as a bulleted list
- **Dimensional findings** (collapsible cards) — each dimension is a `{ assessment: string, findings: CoachingMoment[] }` object. Display the `assessment` paragraph at the top of the card. Each `finding` is a three-part `CoachingMoment` (`anchor`, `betterOption`, `whyThisMatters`) — render as a structured card with all three parts visible (the `whyThisMatters` carries the cost + reusable principle — it's what makes the lesson transferable). **`structureAndFlow` should be the most prominent card** — structure is the most important dimensional analysis and the prompt produces the richest assessment for it.
  - Structure & flow — `analysis.structureAndFlow.assessment` + `analysis.structureAndFlow.findings[]`
  - Clarity & conciseness — `analysis.clarityAndConciseness.assessment` + `.findings[]`
  - Relevance & focus — `analysis.relevanceAndFocus.assessment` + `.findings[]`
  - Engagement — `analysis.engagement.assessment` + `.findings[]`
  - Professionalism — `analysis.professionalism.assessment` + `.findings[]`
- **Teachable moments** — `analysis.fixTheseFirst` / `analysis.moreMoments` listed with clickable anchors back into the transcript. Each moment has the three-part `CoachingMoment` shape (`anchor`, `betterOption`, `whyThisMatters`) plus `type`, `severity`, `timestamp`, `transcriptIdx`. Display all three coaching parts — surfacing only "what's wrong" without "why the better one is better" loses the lesson.
- **Quantitative metrics** — small data cards:
  - Filler rate — `analysis.fillerWords.perMinute` per minute, with a breakdown bar chart
  - Speaking pace — `analysis.fluency.wordsPerMinute` WPM
  - Vocabulary — `analysis.vocabulary.uniqueWords` unique words, sophistication score gauge
  - Communication style — `analysis.communicationStyle` directness / formality / confidence as gauges
  - Self-corrections, response latency — supporting numbers
- **Improvements / regressions** — `analysis.improvements` and `analysis.regressions` shown as small badges with green/yellow accent
- **Notes** — `analysis.notes` shown small, italic, only if non-empty

#### Action buttons
- **"Practice this conversation"** — creates a scenario replay drill (depends on `captures-drill-generation.md`)
- **"Delete"** — removes the conversation document and audio file (with confirmation modal)
- **(Optional)** "Report as filtered incorrectly" — for rejected captures the user thinks should have been kept

---

### 3. Conversations dashboard widgets (optional, for the existing dashboard)

- "Recent conversations" carousel — last 5 with title + date
- "Patterns trending" — uses the change-tracking from `improvements`/`regressions` across captures over time. E.g., "Filler words trending down — averaging 1.2/min vs 2.4/min last month."
- "Conversations awaiting practice" — captures whose `mainIssue` hasn't been addressed by a recent drill

---

## Data sources

All from existing Firestore collections written by the captures pipeline:

- **`captures/{captureId}`** — per-conversation document with all the fields described above
- The user's UID is in the doc; security rules need to restrict reads to the owning user (see "Pending: Firestore security rules" in `memory/`)

**Audio playback:** Cloud Storage at `captures/{uid}/{captureId}/audio.opus`. Either generate a signed URL on the server when the detail page loads (one extra round-trip but always fresh), or store one on the doc when the capture is uploaded (saved a request but URL eventually expires). New endpoint: `app/api/captures/[id]/audio-url/route.ts`.

---

## Turn-based rewrites — implemented

`CaptureAnalysis.turnRewrites` is implemented end-to-end. One entry per user turn in transcript order — `{ transcriptIdx, original, rewrite, verdict, note, suggestedBeforeIdx? }`. `verdict` is one of `keep | tighten | sharpen | reframe | reorder | non_english`; `keep` turns carry no required changes (rewrite may equal original); `non_english` marks turns spoken in another language (ASR runs `language=en`, so they transcribe garbled) — server-enforced pure passthrough (rewrite === original, note null), excluded from all coaching/metrics and from the stitched read-through. Cross-turn sequencing points live in `CaptureAnalysis.structuralObservations` (`{ observation, explanation, affectedTurnIdxs }`). No separate prose rewrite field exists — the "read straight through" view is derived in the UI by `stitchTurnRewrites()` in `lib/captures/rewrites.ts`.

UI: the Rewrites tab has a view toggle (Turn-by-turn | Read straight through), with a collapsed "N turns already strong" / "N turns Sayzo couldn't make out" row for 3+ consecutive same-verdict `keep`s / `non_english`es, and a structural notes panel at the bottom. Inline in the transcript, each user turn shows a "See improvement" / "Already strong" expander that opens a `TurnRewriteCard`; `non_english` turns render dimmed with a static "Couldn't make this out clearly" chip instead (soft copy on purpose — the classifier can mislabel mangled English, so the UI never asserts "you spoke another language").

---

## Transcript corrections (mishearing fixes) — implemented

Users can fix words the transcription misheard (proper nouns, domain terms) without being able to sanitize their speech — fillers/hedges are the coaching signal, so free editing stays banned. Mechanism: **constrained overlay** — `CaptureType.transcriptCorrections` holds span→replacement records `{ transcriptIdx, charStart, charEnd, original, replacement, isVocabularyTerm, createdAt }` anchored to the immutable `serverTranscript`; the raw transcript is never mutated. Applied at display/read time via `lib/captures/corrections.ts` (`applyTranscriptCorrections` / `applyCorrectionsToText` / `segmentLineWithCorrections`).

Validation is two-layered at `POST /api/captures/[id]/corrections` (webapp-only — agent tokens rejected): deterministic guards (`checkCorrectionGuards`: whole-token spans ≤4 words, locked filler lexicon um/uh/you-know/i-mean, non-empty replacement ≤60 chars, no overlaps, 10/capture cap) then a batched gpt-4o-mini mishearing judge (`lib/captures/correction-judge.ts` + `prompts/captures/correction-judge.md`) that rejects sanitizing (filler/hedge/grammar edits) and non-phonetic swaps. Fail closed.

Corrected text appears in: transcript view (dotted underline + "Corrected by you" tooltip), turn-anchored analysis quotes (turnRewrite `original`, teachable-moment `anchor` — render-time via `applyCorrectionsToAnalysis` in analysis-view; dimensional findings have no transcriptIdx and stay raw), feedback-chat transcript context, and replay-from-capture planner input. Stored analysis stays raw; no re-analysis.

Editing UX is direct manipulation (no modal): a persistent hint line above the transcript ("Misheard a name or word? Click it in the transcript to fix it."), every word in the transcript is clickable (locked fillers and already-corrected spans aren't), and clicking opens `transcript-correction-editor.tsx` inline under that line — the clicked word shown as a chip, an autofocused input (Enter submits, Escape cancels), "Fix it"/Cancel. **One word per fix in the UI** (deliberate simplicity; the API still accepts multi-word spans up to 4 if a future UX needs them). The hint and clickability disappear at the 10-fix cap.

Accepted corrections flagged `isVocabularyTerm` feed `learner-models/{uid}.asrVocabulary` (50-term cap, case-insensitive dedupe) which is passed as Nova-3 `keyterm` params on future capture AND replay transcriptions — the root-cause fix for recurring mishearings.

---

## Meeting summary — implemented

Structured actionable notes per conversation, stored at `CaptureType.meetingSummary` (`schemas/capture/meeting-summary.ts`): `{ tldr, whatHappened[{text, isDecision}], yourActionItems[{text, deadline}], othersActionItems[…], comingUp, generatedAt }`. Generated by a dedicated small-model pass (`lib/captures/meeting-summary.ts`, `prompts/captures/meeting-summary.md`, `MEETING_SUMMARY_MODEL` env, default gpt-4o-mini) run **best-effort concurrently with deep analysis** inside the analyze stage — no new pipeline status; failure leaves the field absent and never blocks coaching.

Grounding floor (server-side, shares `lib/captures/fabrication-floor.ts` with the coaching insight): a fabricated specific in `tldr` rejects the whole summary; in a bullet/action item it drops just that item; deadlines get the stricter `verifyDeadline` (every digit/weekday/month/relative-day token must appear in the transcript — no sentence-initial skip) and are nulled, keeping the item. Deadlines keep the transcript's own phrasing ("by Friday"), never calendar dates — the prompt deliberately receives no current date. Always omit, never rewrite.

UI: the summary lives **in the hero block**, replacing the old one-line `serverSummary` text — the `tldr` renders inline under the title and a **"document edge" bar** — one glassy sky-bordered bar reading `MEETING NOTES │ 2 to-dos for you · 1 decision · by Friday ⌄` (plain mono readout, deliberately NOT pills: the hero meta row below already has badges) — toggles the full briefing open within the same container (`MeetingSummaryHero` in `components/conversations/meeting-summary-view.tsx`): gutter-labeled sections, an interactive checklist for the user's own action items (check-offs are localStorage-only, never server-written), grounded deadline chips, a "Coming up" band, and a copy-to-plain-text action. There is **no Summary tab** — `FeedbackTabs` stays a two-tab shell ("Coaching" / "Improved Version"; "Now" was renamed "Coaching") and coaching remains the landing view. Sections with nothing in them are hidden (a casual chat shows only the TL;DR with nothing to expand). No summary (legacy capture or failed generation) → the plain `serverSummary` line renders as before. Corrections are NOT overlaid on summary prose (no transcript anchors — same gap as dimensional findings) and never trigger re-generation. One-off backfill for legacy captures: `POST /api/admin/captures/backfill-summaries` (admin-only, cursor-paginated, idempotent), driven from the **Maintenance page** in the admin dashboard (`/admin/maintenance` — loops batches until the cursor is exhausted, with live counters and a stop button).

Design language: both feedback surfaces (conversation tabs + replay tabs) share the "briefing sheet" primitives in `components/coaching/briefing.tsx` — `StaggerItem`/`staggerEnter` (one-time staggered fade-rise entrance, tw-animate-css keyframes with inline delay) and `Kicker` (mono uppercase micro-label, sky/emerald/amber/muted tones). Cards use sky hairline borders (`border-sky-100`, dark `sky-900/40`), "Try instead"/"What changed" boxes use a sky tint, and section headers carry mono labels. Keep new feedback cards on this language on BOTH surfaces (parity).

---

## Files to create / touch

### New files
- `app/conversations/page.tsx` — list view route
- `app/conversations/[id]/page.tsx` — detail view route
- `components/conversations/ConversationsList.tsx`
- `components/conversations/ConversationCard.tsx` — list row
- `components/conversations/ConversationDetail.tsx`
- `components/conversations/TranscriptView.tsx` — speaker-tagged + clickable lines + inline teachable moment highlights
- `components/conversations/AnalysisView.tsx` — dimensional findings cards + metrics
- `components/conversations/AudioPlayer.tsx` — wraps the native audio element with seek-from-transcript support
- `hooks/use-conversations.ts` — Firestore real-time listener for the list
- `hooks/use-conversation.ts` — single capture fetch
- `app/api/captures/[id]/audio-url/route.ts` — generate signed URL on demand (auth required)
- `app/api/captures/[id]/route.ts` — DELETE handler for the delete button (also GET for reads if not using direct Firestore client)

### Maybe touched
- Existing nav / sidebar — add a "Conversations" entry
- Firestore security rules — restrict capture reads to owning user (see security pending items)
- `enums/firebase.ts` — already has `CAPTURES`

---

## Open questions

1. **Real-time updates while processing** — Should the UI use Firestore real-time listeners so the user sees status updates as the pipeline progresses? Drills already do this. Recommendation: yes, matches existing pattern.
2. **Pagination strategy** for the conversations list — Firestore cursor-based with a "Load more" button? Or infinite scroll? Probably cursor + Load more for v1.
3. **Audio retention** — Long-term, do we keep all audio? Or expire after N days to save Cloud Storage cost? Needs a product decision; backend would need a cleanup cron.
4. **Privacy display** — When a capture is rejected, should we show the user *what* was rejected so they can flag false positives? Or keep rejected captures completely hidden?
5. **Cross-referencing with drills** — Should the drill detail view show "this drill was suggested by your conversation on April 10"? Depends on the drill generation work (`captures-drill-generation.md`).
