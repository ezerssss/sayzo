import { z } from "zod";

import { coachingMomentSchema } from "./coaching-moment";

/**
 * One coaching dimension (structure & flow, clarity & conciseness, relevance &
 * focus, engagement, professionalism): a macro `assessment` paragraph plus
 * specific `findings`, each a three-part `CoachingMoment`.
 *
 * Shared by drills and captures. For a 60-second drill, `assessment` is required
 * and `findings` is usually empty or 1-2 entries — don't force conversation-depth
 * onto a short answer.
 */
export const dimensionalAnalysisSchema = z.object({
    assessment: z.string(),
    findings: z.array(coachingMomentSchema),
});
export type DimensionalAnalysis = z.infer<typeof dimensionalAnalysisSchema>;
