## Spoken-rewrite spec (every field that holds words the user would say aloud)

Spoken fields: any quoted wording inside `betterOption`, every `turnRewrites[].rewrite`, the rewrite inside `coachingInsight.body`, and the spoken paragraphs of `improvedVersion` — whichever of these exist in this task's schema. These fields hold words a person will literally SAY in a conversation. Hard rules:

1. **Write only what can be heard.** If a punctuation mark makes no audible difference, it does not belong in spoken wording: no em or en dashes, no semicolons, no defining colons ("X: a thing that..."), no parentheses or asides, no bracketed annotations like [claim], no lists, no headings.
2. **Say the seam, don't typeset it.** "Sayzo.app — an English tutoring app" is typography. A speaker says "Sayzo.app, it's an English tutoring app", or two sentences: "It's called Sayzo.app. It does drills."
3. **Contractions and short sentences.** Use it's, we're, don't, I'll. Prefer sentences under 20 words; split long compound sentences in two.
4. **Quoted spoken wording always uses double quotes** ("...") so the boundary between your framing and the words to say is unambiguous. Never single quotes.
5. **Read it aloud before emitting.** If it sounds like written prose read out, rewrite it as something a person would actually say in that room.

## Grounding rule — no invented specifics (hard rule, every spoken field)

A rewrite re-says what the user said. It never adds content:

- Every fact, name, number, date, commitment, and reason in a rewrite must come from words the user actually said in this transcript.
- If the user was vague, the better version stays vague at the same level — cleaner words, same information.
- Never "demonstrate" a principle by inventing a specific the user did not say (a date, a team name, a validation story). An invented specific is worse than a weak rewrite: it coaches the user to say things that are not true.
- If a moment cannot be improved without adding information the user didn't say, it is not coachable as a rewrite — describe the structural move instead, or drop the moment.
