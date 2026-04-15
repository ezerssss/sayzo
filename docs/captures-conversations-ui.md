# Conversations UI Spec

**Status:** Shipped (v1). Implemented as SPA state modes (`conversations` / `conversation-detail`) in `app/page.tsx`, not file-based routes. See `components/conversations/` for the UI components. Dashboard has a "Conversations" button linking to the list view. Detail view shows transcript with inline teachable-moment and native-speaker-rewrite highlights, full analysis with collapsible dimensional cards (four-part CoachingMoment shape), audio playback, and a "Practice this conversation" button that creates a scenario-replay drill with comparison-aware analysis.

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
- Speaker-tagged, timestamped lines from `serverTranscript` (fall back to `agentTranscript`)
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
- **Dimensional findings** (collapsible cards) — each dimension is a `{ assessment: string, findings: CoachingMoment[] }` object. Display the `assessment` paragraph at the top of the card. Each `finding` is a four-part `CoachingMoment` (`anchor`, `whyIssue`, `betterOption`, `keyTakeaway`) — render as a structured card with all four parts visible (the `keyTakeaway` is the most important — it's what makes the lesson transferable). **`structureAndFlow` should be the most prominent card** — structure is the most important dimensional analysis and the prompt produces the richest assessment for it.
  - Structure & flow — `analysis.structureAndFlow.assessment` + `analysis.structureAndFlow.findings[]`
  - Clarity & conciseness — `analysis.clarityAndConciseness.assessment` + `.findings[]`
  - Relevance & focus — `analysis.relevanceAndFocus.assessment` + `.findings[]`
  - Engagement — `analysis.engagement.assessment` + `.findings[]`
  - Professionalism — `analysis.professionalism.assessment` + `.findings[]`
  - Voice / tone / expression — `analysis.voiceToneExpression.assessment` + `.findings[]` (Hume-grounded)
- **Teachable moments** — `analysis.teachableMoments` listed with clickable anchors back into the transcript. Each moment has the four-part `CoachingMoment` shape (`anchor`, `whyIssue`, `betterOption`, `keyTakeaway`) plus `type`, `severity`, `timestamp`, `transcriptIdx`. Display all four coaching parts — surfacing only "what's wrong" without "why the better one is better" loses the lesson.
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

## Native speaker rewrites — backend done, UI pending

`CaptureAnalysis.nativeSpeakerRewrites` is **already implemented** in the backend. It's an array of `{ transcriptIdx, original, rewrite, note }` items produced by the deep-analysis stage for the user's 5-10 most coachable turns. The analyzer prompt mirrors the drill side's `nativeSpeakerVersion` quality bar — same improvement categories (structure, word choice, transitions, conciseness, flow, confident phrasing), same "notes are the main learning tool" framing, same specific note style, but adapted from a single-block rewrite to per-turn rewrites because captures are multi-turn organic conversations.

**What the UI needs to display:**

In the transcript view, when a user turn has a corresponding `nativeSpeakerRewrite` (matched by `transcriptIdx`):
- Show the original turn as usual (the user's actual words)
- Below or beside it, show the rewrite with a clear visual treatment that says "how a fluent speaker would say it"
- Below the rewrite, show the `note` explaining what changed and why
- Possible layouts:
  - **Inline** — original turn → rewrite indented or in a different background → note in italic. Compact but mixes the literal transcript with coaching content.
  - **Expandable** — original turn shows a small icon/badge "✨ rewrite available" that expands to reveal the rewrite + note. Cleaner default view, opt-in to coaching.
  - **Side-by-side** — original on the left, rewrite on the right with the note below. Good on wide screens, doesn't work well on mobile.
- Recommendation: **expandable** as default, with a "Show all rewrites" toggle at the top of the transcript view.

The rewrites should also be summarized somewhere in the analysis section so users can see them without scrolling the whole transcript:
- A "Native speaker rewrites" card showing all rewrites in order, each as a small card with original / rewrite / note
- Click any card to jump to that transcript line

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
