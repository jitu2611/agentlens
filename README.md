# AgentLens

**See what your coding agent did, understand what was risky, and keep the evidence local.**

AgentLens is a local-first observability and security workspace for AI coding agents. It turns raw session traces into a clear execution timeline, detects risky behavior with explainable rules, redacts sensitive values, and produces audit-ready reports without uploading source code or conversations.

> Active development: the first public release is being built in the open.

## Product principles

- **Local by default** — traces, findings, and reports stay on your machine.
- **Explainable** — every risk score points to the rule and evidence that produced it.
- **Vendor-neutral** — one normalized view across supported coding-agent formats.
- **Safe to share** — secrets are redacted before data reaches the dashboard or exports.
- **Useful without AI** — deterministic analysis requires no model, account, or paid API.

## Planned v0.1 workflow

1. Import a supported JSONL session.
2. Review prompts, tool calls, commands, file operations, and outcomes on one timeline.
3. Inspect security findings and scope violations.
4. Export a sanitized Markdown or JSON audit report.

## Status

AgentLens is pre-release software. APIs and file formats may change before v0.1.0.

## License

[MIT](LICENSE)
