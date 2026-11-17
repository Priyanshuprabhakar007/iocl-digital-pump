# Stage 01W — DB-side source revision fence prototype (offline only)

**Outcome sought:** an attempt to persist reconciliation evidence computed from an obsolete source revision must reject atomically, not partially insert stale evidence.

## What is implemented
A disposable local-D1 fixture `scripts/stage01w/PROPOSED_atomic_version_fence_fixture.sql` declares synthetic shift-scoped revision and evidence tables, with a BEFORE INSERT guard requiring **both** the matching source revision and CLOSING shift status **inside the same database transaction as the INSERT**. The local integration test:
1. Creates a synthetic shift via the real Hono Worker API.
2. Sets revision 5 at preview time, claims CLOSING, and simulates a version 6 source change.
3. Attempts an atomic two-statement D1 batch: even if the first INSERT succeeds, stale second INSERT must abort **the entire batch**, leaving no prepared evidence.
4. Checks accepted matching-version writes and rejects writes after CLOSED.

## Major limitation: not an installed safety fence
This is a **prototype**, not a production migration or a modification to the real `AtomicShiftCloseFinalizer` or `ShiftCloseService`. The synthetic revision is **manually updated by the test**. Actual automatic revision increments across every source write, shared price/calibration master updates and other financial domains remain unimplemented. The real stock/financial PREPARED batch does **not** yet include this revision check. The second stage of finalization also still requires a frozen input-identity contract.

To integrate safely, domain owners must approve authoritative source revision semantics; the version update must be atomic with every authoritative input mutation (including shared versions), and both the source snapshot used for previews and the batch-side check must be derived from the same inputs. Prefer immutable per-shift master snapshots and checks covering all consumed data.

## Release blockers
- Actual journal/idempotency feature integration and approved migration after frozen 0001–0035;
- Full hosted D1 Worker UAT with synthetic data, independent instance contention, network-after-commit uncertainty and recovery;
- Finance/security/audit/operations owner reviews, backup/restore, and manual release approval.

**NO production data accessed. NO remote D1 commands. NO deployment or migration. Keep all PRs draft. Current Phase 1 release decision: NO-GO.**
