# CF Pages build fix — round 2

Only one error left: `src/pages/CouncilPage.tsx(235,35)` — a direct cast of
`BenchmarkCandidateInput` to `Record<string, unknown>` isn't allowed because
the two types don't overlap enough for TS to consider it safe.

Fix: route through `unknown` first — `candidate as unknown as Record<string, unknown>`.
That's the only change in this file.

Replace `src/pages/CouncilPage.tsx` with the one in this folder and push.
