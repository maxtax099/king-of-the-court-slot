# King of the Court — court-92-v1

Original basketball slot, using the generated original 12-symbol artwork. Six reels, five rows, 19 fixed lines. One paid mode (`base`, cost 1×). Crown Ball Wilds and sticky multiplier Royal Reels, 8/10/12-spin feature tiers, a capped extra-spin meter, and consecutive-win Momentum. This does not reproduce another game's unknown reel probabilities or paid feature modes.

## Exact scope of 92% RTP

The game samples a **finite weighted library of complete rounds**, including each triggered feature. It does not sample independent uniform reel symbols. The supplied 13,002 records have total integer weight 1,000,000,000 and weighted payout-unit sum 92,000,000,000. Payout units are hundredths of stake. Thus RTP is exactly `92,000,000,000 / (100 × 1,000,000,000) = 23/25 = 92%`.

All published rounds were independently re-evaluated from the compressed math books; every lookup payout and frontend event was compared. See `math/REPORT.json` and `math/VERIFICATION.json`. Max round win is 50,000×, capped across the base and all feature reveals. This is mathematical verification of these specific files, not Engine approval. Distribution size is below the SDK recommendation of 100k+ rounds per mode for production variety; expand and recalibrate before release. Bonus entry is about once per 564 weighted base rounds; outcomes are deliberately high variance. No individual session return is promised.

## Folder upload

- Math: select `math/publish_files` (contains index.json directly, plus CSV and .jsonl.zst).
- Front end: select the packaged `frontend` folder (index.html directly inside).
- Upload matching versions together. Round events are custom `courtReveal` / `courtBonusStart` / `courtBonusEnd` events interpreted by this frontend.
- Studio publication, betlevel templates, platform-side validation and approval still require your dashboard. Do not claim those checks passed from local tests.

## Run and test locally

`python3 -m http.server 8000 --bind 0.0.0.0` from this directory. A URL without Engine launch parameters runs demo credits and samples the weighted catalog. The local-only unweighted feature-preview button deliberately overrides the probability distribution and is excluded from RTP claims.

`node --test --test-isolation=none tests/game.test.mjs`

`python3 -m pip install -r math/requirements.txt` (needed only to rebuild/verify math).

`python3 math/source/generate.py` regenerates the deterministic weighted files and JS model.

`python3 math/source/verify.py` independently audits the actual compressed files.

## Engine transport

`js/outcomes.js` implements the officially documented HTTPS launch `rgs_url` and `sessionID`, authenticate, server-configured bets, play and positive-win end-round calls. Balances in Engine mode are displayed only from wallet responses. Free reveals never place additional wallet plays. Active round state resumes at its original stake; ambiguous debit failures block another request and instruct re-authentication by reload. API currencies use six-decimal integer units. Demo mode never activates as a fallback when Engine authentication fails.

Transport has local mocked-response coverage; no real Studio session was available. Replay, full jurisdiction-specific wording, the required current general disclaimer and the full official approval prompt audit remain unfinished. This version must not be described as ready for real-money launch. See math/SOURCES.md for pinned official contract sources.

## Assets and structure

`assets/symbols/symbols.png`: original 4×3 atlas. `js/config.js` maps IDs to artwork. Royal Reel Wild uses the king portrait plus a multiplier overlay, so there is no unrelated vampire art. `math/source/model.json` defines rules; `generate.py` emits `js/model.js` shared by the frontend. `js/evaluate.js` is a verifier/visual helper, never the production wallet. `js/game.js` consumes one precomputed complete-round event stream. `js/ui.js` renders the events and controls.

Do not change payouts or lookup weights without recalculating and exhaustively verifying the new distribution.
