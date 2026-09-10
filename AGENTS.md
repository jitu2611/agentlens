# Autonomous development policy

AgentLens is an original, local-first developer tool. Implement features from first principles; do not copy source code, assets, prose, or branding from other products.

- Work only in this repository during a run.
- Create at most one focused, meaningful PR per run; never create empty commits.
- Use an existing issue, or create one for a concrete slice when none exists.
- Use feature branches and conventional commits.
- Every PR must include tests or an explicit documentation-only rationale.
- Run `npm run check` before pushing.
- Label AI-assisted issues and PRs with `AI-assisted`.
- Do not merge a PR until remote CI succeeds.
- Use local/free tooling and never commit real traces, credentials, tokens, or private data.
