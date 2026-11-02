# Official source contracts used

Read directly from public official repositories, not guessed from screenshots.

- https://github.com/StakeEngine/math-sdk/tree/141b4e89065ac4400769709a919259a923430c4d
  - `docs/rgs_docs/data_format.md`: index schema, unsigned CSV ID/weight/payout, payout units of 100, Zstandard JSONL books.
  - `docs/rgs_docs/RGS.md`: URL parameters, micro-unit currency, authenticate, play, end-round and authenticated bet limits.
- https://github.com/StakeEngine/web-sdk/tree/1843d60cedb94b390e641b563f32ad64353bec5e
  - `packages/rgs-fetcher/src/schema.ts`: RoundDetailObject and jurisdiction flags.
  - `packages/components-shared/src/components/Authenticate.svelte`: resume original round amount and state.
  - `packages/utils-xstate/src/createPrimaryMachines.ts`: no-win lifecycle without end-round and free-game settlement.

These repositories document transport and publication contracts. They do not imply Studio accepted, published, certified or approved this particular game. The newer approval prompt at studio.engine.io was blocked by the environment proxy (HTTP 403); this is not a full current approval audit.
