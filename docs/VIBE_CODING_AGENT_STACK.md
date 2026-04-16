# Vibe Coding Agent Stack

This document keeps the repo's agent and skill setup intentionally small.

## Default Local Workflow

1. Read `AGENTS.md` first.
2. Use `make agent-ci` for compact verification.
3. Use `scripts/spec-kit/bash/update-agent-context.sh` or `scripts/spec-kit/powershell/update-agent-context.ps1` only to refresh agent context files after spec changes.
4. Keep risky actions behind explicit confirmation.

## Useful External Skill Patterns

Source catalog:
- `https://github.com/ComposioHQ/awesome-claude-skills`

Reference-only UI/UX pattern source:
- `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill`

High-signal skills for this repo:

- `skill-creator`
  - Use when a workflow becomes repetitive enough to deserve a reusable skill.
  - Best candidates here are session repair, deploy smoke validation, and frontend recount smoke.
- `webapp-testing`
  - Good pattern for frontend verification: use helper scripts as black boxes and keep Playwright logic focused on rendered state.
  - Fits this repo's existing Playwright and smoke-test workflow.
- `changelog-generator`
  - Useful for release notes, weekly summaries, and operator-facing deployment updates.
- `mcp-builder`
  - Relevant only if this repo grows external tool integrations or an MCP server layer.

## External UI/UX Patterns To Keep

Use `ui-ux-pro-max-skill` as a reference source for agent behavior, not as a direct install.

- Keep its design-decision workflow:
  - choose product or screen intent first
  - pick one style direction
  - define colors, type, spacing, elevation, and motion before coding
- Keep its operational quality bar:
  - `44x44` touch targets
  - safe-area aware layouts
  - reduced-motion support
  - text scaling support
  - contrast validation
  - explicit empty, loading, error, and success states
- Keep its anti-pattern mindset:
  - avoid random mixed styles
  - avoid decorative motion without UX meaning
  - avoid status communication by color alone
  - avoid purple or pink AI styling on enterprise or operations screens
  - avoid over-decorated surfaces on dense task flows

Do not install that repo directly into agent runtime without a separate review. A local static audit flagged credential reads and command-execution capable scripts, so the safe path is to extract guidance into local docs instead.

Low-priority for this repo right now:

- `connect` / `connect-apps`
  - Powerful, but they introduce live third-party actions and auth overhead. Only add them if the repo needs outbound SaaS automation.

## Repo-Specific Recommendations

- Prefer helper scripts and make targets over long inline command sequences.
- Keep agent docs short and task-oriented. Push deep detail into focused docs or scripts.
- Treat legacy vibe-coding installers under `scripts/legacy/` as archive material, not the default path.

## Repo-Local Skills

- `agent_skills/session-snapshot-maintenance/SKILL.md`
  - Dry-run-first workflow for `backfill_session_snapshots.py` and `cleanup_synthetic_session_data.py`
  - Uses `scripts/agent_approval_log.py` to attach `run_id` and `call_id` to risky steps

## Next Skill Candidates

- `deploy-smoke`
  - Post-deploy checks for backend health, frontend reachability, and auth smoke.
- `recount-ui-smoke`
  - Frontend recount assignment verification using the existing Playwright flow.
