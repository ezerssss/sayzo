# Captures → Drills: Drill Generation Spec

**Status:** User-triggered scenario replay shipped. The "Practice this conversation" button on the conversation detail view creates a `scenario_replay` session with `sourceCaptureId` via `POST /api/captures/[id]/practice`, using a dedicated planner (`services/capture-replay-planner.ts` + `prompts/planner/replay-from-capture.md`). Comparison-aware analysis is wired into the existing `/api/sessions/complete` pipeline. Auto-suggest and targeted drill generation from captures remain pending. `lib/captures/drills.ts` is still a no-op stub.

## Background

Captures are real conversations the user participates in (meetings, calls, etc.) processed through the pipeline at `lib/captures/process.ts`. After deep analysis (Stage 3) and user profiling (Stage 4), Stage 5 should generate drill suggestions targeting the user's identified weaknesses — but the design for *how* captures become drills is still open.

The original captures spec describes two distinct drill types that should come from captures.

---

## Drill type 1: Targeted drills

Standard platform drills (entries in the `sessions` collection) seeded with the user's actual mistakes from the capture analysis.

**Examples:**
- "Practice using articles correctly in technical descriptions" — uses real article-omission examples from the user's speech
- "Reduce filler word usage in explanations" — based on the user's actual filler frequency
- "Expand vocabulary for describing project status" — based on the user's repeated reliance on simple words

**The good news:** these mostly already work via the existing planner. Captures already write to `skill-memories` via `lib/captures/profile.ts` (strengths, weaknesses, reinforcement focus), and the planner naturally pulls capture-derived weaknesses into future drills via the existing `services/planner.ts` flow. The new `internalCaptureContext` and `internalCaptureDeliveryNotes` fields on `UserProfileType` (added this session) further inform planning.

**What's still missing:**
- **Traceability** — there's no link from a drill back to the capture that motivated it. Users don't see "this drill exists because of your meeting on April 10". We should add a `sourceCaptureId` field on `SessionType`.
- **Surface-level "why this drill" copy** — the planner could mention (in skillTarget or scenario) that this drill targets a real pattern from the user's recent conversations, without quoting the capture verbatim (privacy / phrasing). This requires a small planner prompt tweak.

---

## Drill type 2: Scenario replay drills

**The high-value one.** Recreate the real conversation as a practice drill. The user already lived the situation, so they don't need to imagine it — they can focus purely on improving their delivery.

**Example:** "You were explaining the caching migration plan to your team. Let's practice that explanation with clearer structure and more precise vocabulary."

**Why this is high-value:**
- The user already remembers the context — zero mental setup cost
- Real stakes are emotionally salient — they actually had to do this
- The user can compare their improved version to what they actually said
- Drills generated from imagined scenarios feel artificial; replays feel real

**What's missing — open design questions:**

### 1. Trigger model
- **Auto-generate** after capture analysis? (every analyzed capture spawns a replay drill in a "suggested drills" tray)
- **User-triggered** from a capture detail view? (button: "Practice this conversation")
- **Suggest-and-accept** in a feed? (ML / heuristic picks the best 1-2 captures per week to suggest replays for)

Recommendation: start with **user-triggered**. It's the lowest-risk path — no auto-generation cluttering the user's drill list, and the user has explicit intent. Once we see usage patterns, we can add auto-suggest. The "Practice this conversation" button in the Conversations UI (see `captures-conversations-ui.md`) is the entry point.

### 2. Drill creation API
- **Extend `planNextSession`** in `services/planner.ts` with a new mode? Risky — that function is already complex and serves the regular drill flow.
- **New function `planScenarioReplayFromCapture(captureId)`** in `services/planner.ts` (or a new `services/capture-replay-planner.ts`)? Cleaner separation, doesn't disturb the existing flow.

Recommendation: **new function**. Keep the regular planner unaware of captures.

### 3. Session schema changes
- Add `sourceCaptureId?: string` field on `SessionType` for traceability — non-breaking
- Add `type?: "drill" | "scenario_replay"` discriminator? Or rely on the presence of `sourceCaptureId`? The discriminator is more explicit; the presence check is simpler.

Recommendation: add both. The discriminator makes UI rendering decisions easy ("show this badge if scenario_replay"); `sourceCaptureId` is the link.

### 4. Scenario shape for replays
The existing planner invents `situationContext`, `givenContent`, and `question`. For replays, those fields should be **derived from the capture**, not invented:
- `situationContext` — derived from the capture's `serverTitle` + `serverSummary` (the model creates a stage-direction-style summary that matches the planner's tone rules)
- `givenContent` — could use bullet points from the capture's analysis (key topics, named entities the user mentioned)
- `question` — the natural prompt that opened the user's most coachable turn ("Walk us through where the migration stands")
- `framework` — chosen based on the user's main weakness in that capture (e.g., if they rambled, use a structured framework like SCQA)
- `skillTarget` — derived from the capture's `mainIssue` or the most-impactful teachable moment

The replay scenario must still pass the planner's voice/framing rules — no third-person directives, no meta-narration, no "we want to learn about you" copy.

### 5. Comparison feedback
This is the killer feature. After the user does the replay, the analyzer should be able to compare their new version to what they actually said in the original capture. Two ways:

- **Side-by-side rewrite-style feedback** — after analyzing the replay drill, also include the original capture's user turns alongside the user's new attempt. Show: "Original" / "Your replay" / "What changed".
- **Delta-only feedback** — focus only on what improved or regressed vs the original. Smaller and more focused.

This requires the analyzer for replay drills to know about the source capture. New analyzer variant or a flag on the existing `analyzeSession` to load and inline the source capture transcript.

---

## Implementation outline (when ready)

1. **Schema changes** (`types/sessions.ts`):
   - Add `sourceCaptureId?: string`
   - Add `type?: "drill" | "scenario_replay"` (default `"drill"` for back-compat)

2. **Planner extension** (`services/planner.ts` or new `services/capture-replay-planner.ts`):
   - New function: `planScenarioReplayFromCapture({ uid, captureId }): Promise<SessionPlanType>`
   - Reads the capture's analysis + transcript + user profile
   - Returns a plan whose scenario fields are derived from the capture
   - Passes voice/framing rules from the existing planner prompt

3. **API route**: `app/api/captures/[id]/practice/route.ts`
   - POST handler — auth via JWT
   - Loads the capture, verifies ownership
   - Calls `planScenarioReplayFromCapture`
   - Creates a session via the existing `buildSessionFromPlan` flow with `type: "scenario_replay"` and `sourceCaptureId`
   - Returns the new session

4. **Captures UI** — adds the "Practice this conversation" button on the detail view (handled in `captures-conversations-ui.md`)

5. **Sessions UI** — for sessions with `type: "scenario_replay"`, show a badge linking back to the source capture

6. **Replay analyzer** — when analyzing a scenario_replay session, the analyzer should:
   - Load the source capture's transcript
   - Pass both transcripts to the LLM
   - Generate comparison feedback (what improved vs original, what's still rough)

7. **`lib/captures/drills.ts`** — replace the stub with actual drill generation logic. For now this can stay minimal: targeted drills happen automatically via the planner reading capture-updated skill memory; scenario replays are user-triggered. Stage 5 might just write a "ready for replay" flag on the capture, or it could be a true no-op if all generation is on-demand.

---

## Dependencies

- Requires the **Conversations UI** (`captures-conversations-ui.md`) to exist for the user-triggered flow
- Captures pipeline must be running and analyzing captures successfully (✓ done)
- New `internalCaptureContext` / `internalCaptureDeliveryNotes` planner fields (✓ done — propagated through `services/planner.ts` and the new-drill route)

## Files that will be touched

- `types/sessions.ts` — `sourceCaptureId`, `type` discriminator
- `services/planner.ts` or new `services/capture-replay-planner.ts` — new function
- `prompts/planner/*` — possibly a new prompt for replay scenarios
- `services/analyzer.ts` and `prompts/analyzer/*` — comparison feedback logic
- `lib/captures/drills.ts` — replace stub
- `lib/captures/process.ts` — call into drills.ts properly
- `app/api/captures/[id]/practice/route.ts` — new
- `app/api/sessions/new-drill/route.ts` — possibly handle replay creation
- Conversations UI components (button + badge)
- Sessions list UI (badge for replays)
