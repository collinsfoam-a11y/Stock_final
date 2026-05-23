# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, do not open a public issue.

Send a report to the maintainers with:

- A clear description of the issue and impact
- Reproduction steps or a proof of concept
- Affected components (`backend/`, `frontend/`, infrastructure)
- Any suggested remediation

## Handling Secrets

- Never commit credentials, API keys, private keys, or production tokens.
- Use the provided `.env.example` templates and keep real `.env` files untracked.
- If a secret is committed, rotate it immediately and remove it from git history if required.

## Supported Versions

Security fixes are applied to the default branch. If you are running a deployed version, update to the latest release or commit on the default branch.

