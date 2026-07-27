# Remediation loop runbook

The remediation loop converts the full review into an ordered, resumable workflow. It never marks implementation work complete by itself and never executes a schema-changing command without both a recorded phase approval and the explicit `--allow-mutations` switch.

## Normal cycle

Run these commands from the repository root:

```powershell
python scripts/remediation_loop.py status
python scripts/remediation_loop.py run --dry-run
python scripts/remediation_loop.py run
```

A manual item stops the loop and prints its required change and target areas. After implementing and reviewing it, record concrete evidence:

```powershell
python scripts/remediation_loop.py complete p0-contracts --evidence "Architecture decision records reviewed in PR 123"
```

Continue with `run`. Command items execute their declared tests and are completed only when every command succeeds. Failed command items retain their attempt count and error; reset one after fixing the cause:

```powershell
python scripts/remediation_loop.py retry p1-validate
```

## Approval gates

Schema and infrastructure phases stop before any work begins. Record who approved the phase and why:

```powershell
python scripts/remediation_loop.py approve phase-3 --by "release-owner" --reason "Backup and rollback rehearsal verified"
```

The manifest currently contains validation commands only. If a future task declares `"mutates": true`, execution additionally requires `run --allow-mutations`.

## State and plan changes

Progress is stored in `.codex/remediation-loop-state.json` and excluded from Git. Writes are atomic and a lock prevents concurrent runners. If the tracked manifest changes, the engine stops. Review the diff, then preserve completed work with:

```powershell
python scripts/remediation_loop.py --accept-manifest-change status
```

The plan itself is `config/remediation_plan.json`; keep task IDs stable when refining descriptions or adding validation commands.
