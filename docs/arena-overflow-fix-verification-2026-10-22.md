# Overflow diagnostic fix and long-game verification — 22 October 2026

Commit `6ba1a89` replaces the generic visual-bot failure for `NUMERIC_LIMIT` with:

> Numeric overflow: a calculation produced a number too large to use. Reduce the numbers in your arithmetic or memory blocks.

The parent worker pool uses a fixed message for this known code. It does not expose arbitrary worker messages or stacks. Malformed successful responses still receive the generic failure. The interpreter continues rejecting non-finite arithmetic without committing the failed decision.

The real-worker regression exercises finite `1e308 + 1e308`, checks the actionable failure, then executes a valid decision in the same pool. All 114 tests, TypeScript and formatting checks passed. The isolated arena was rebuilt; the separate phone-playtest stack was not rebuilt.

Independent agent session: `297d0df6-6b73-4884-ba3c-f7064d8e21f8`.

## Independent UI verification and policies

Bert7 reproduced the original finite-operands overflow through actual maker controls. Screenshot `b936acc7-0cfa-473a-90b8-4fa31764c707` records the new message, with no stale preview. Restoring initial memory to 0 and increment to 3 produced `clock=3`, cooperate; the overflow draft was never published. Issue `da17f34b-cb86-4e58-a71c-4fb4497b49fc` is resolved in the persistent ledger.

Fresh bots were authored through the maker, published and reloaded:

- Ada7 Conditional Diplomat (`85054ce4-fbf4-43c6-b4ca-a09ab7dcca90`, 21 blocks): cooperate when own score >= opponent score AND that opponent's cooperation count >= betrayal count; otherwise retaliate to last betrayal, otherwise betray from round 25, else cooperate. Revision 2 changes the cutoff to 10.
- Bert7 Recovery Pulse (`7e813526-2977-4ad9-81d6-88698c717666`, 18 blocks): add 3 to numeric clock and toggle boolean flip; betray when flip AND clock >9, else cooperate. Revision 2 changes the gate to 3.
- Cora7 Score Lottery (`f5ef203e-b8c0-42ac-99fd-34d37c72ada8`, 19 blocks): after last betrayal cooperate if random <0.3; otherwise cooperate if random <(0.4 - own score); betray on false branches. Revision 2 changes the retaliation threshold to 0.7. Exactly one random sample per path supports independent replay.

## New finding

Issue `c7cc4ecc-c451-450d-8e49-5f268cd689b4`: entering nonfinite literal `1e309` is safely blocked and Test is disabled, but the only explanation is **Invalid JSON value**. This is a separate usability finding: the editor should explain the numeric limit and identify the number input. A finite `1e308` works; restoring 0.7 recovers the policy. Screenshot `575dad91` and recovery `aa92e01a` are saved in the run. The disabled-button click timeout during this negative probe is expected test-driver behaviour, not a game execution failure.

## Long-game audit

| Match | Version | Ada | Bert | Cora | Clanker |
| --- | --- | ---: | ---: | ---: | ---: |
| `dba95b87-a259-4843-bdf2-6001bcfc88e5` | R1 | 0 | 0 | -4 | -11 |
| `bdb7220d-2329-44f8-9990-25f50dbe7f2d` | R2 | 7 | -8 | 7 | -11 |

Both 50-round games finished with all seats active and zero timeouts. Independent audits passed for 100 rounds, 200 pair results and 400 persisted moves, recomputing payoffs, score totals, pair coverage and exactly one move per seat per round. All 300 visual decisions were accepted with zero errors. Independent strategy replay matched all six pinned bot versions, every move, private Choose trace, final memory and RNG state.

Running game one retained revision 1 after all three owners published revision 2. Game two seated revision 2. Bert's first-game round 3 was clock 9/flip true/condition false/cooperate; second-game round 3 was clock 9/flip true/condition true/betray, with fresh round-1 clock 3. Final clock was 150 and flip false in both games. Ada's revised round-10 late branch was visible in live private feedback. History expansion retained all 50 decisions and reset correctly on the new match.

All Ada and Bert conditional branches took both paths in each game. Cora's history and retaliation-probability branches took both paths; the score-arithmetic branch took only its false path in live games (17 and 23 decisions), while its true path was exercised in practice. This is a live coverage limit, not a failed decision.

Intermittent Windows-to-overseer helper fetch failures interrupted optional navigation. Agents observed state before retrying; server-side play continued. These transport failures were not established as game defects. Two negative-probe click failures were expected: disabled Test after a nonfinite literal and disabled Join until the returning player walked near the table.

Evidence is preserved in the persistent local arena database and ignored `data/arena/297d0df6-6b73-4884-ba3c-f7064d8e21f8/`: independent-audit.json, bot-evidence.json, complex-bot-audit.json, screenshots, per-player browser traces and report.json. All three player contexts were closed after audit. The session is marked failed because the new diagnostic issue remains open; the requested overflow fix and gameplay audits passed.
