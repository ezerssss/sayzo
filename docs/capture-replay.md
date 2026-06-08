# Capture replay (practice a real conversation)

Standalone generated drills were removed. The only practice surface is the
**replay**: from an analyzed conversation, the user re-does that exact moment
and gets comparison coaching against what they originally said.

## Flow

1. The desktop companion uploads a conversation; the pipeline in
   `lib/captures/process.ts` analyzes it (status reaches `analyzed`).
2. On the conversation detail view
   (`components/conversations/conversation-detail-view.tsx`), the user taps
   **Replay this conversation**.
3. `POST /api/captures/[id]/practice` charges a credit, dedupes against an
   existing replay, plans a scenario with `services/capture-replay-planner.ts`
   (`planScenarioReplayFromCapture` + the extracted `buildSessionFromPlan`), and
   writes a `sessions` doc with `type: "scenario_replay"` + `sourceCaptureId`.
4. The user records at `/app/replays/[id]`
   (`components/session/session-home`), and `POST /api/sessions/complete`
   transcribes, runs the relevance check + analysis with the source capture as
   `ReplayContext` (comparison feedback), and persists the result. It then
   refreshes the learner model's skill memory from the completed replay via
   `refreshSkillMemoryFromLatestSession` (re-homed into
   `services/skill-memory-updater.ts`).

## Notes

- There is no auto-generation. A replay is created only by the explicit button.
- Replays surface on their source conversation's detail page, not a global list.
- The `sessions` collection and the `drills/{uid}/...` storage path keep their
  names (legacy; renaming live data was not worth the migration). Old
  `type: "drill"` docs remain readable and inert.
