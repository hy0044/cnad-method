# CNAD Method

**CNAD — Context-Native AI Development** is an experimental development method for AI-assisted software engineering.

CNAD preserves useful implementation context for as long as it adds value, scales process with risk, and introduces a deliberate context boundary for independent review.

> Preserve context during implementation. Reset context for independent judgment.

## Status

CNAD is an early hypothesis under active dogfooding. The npm CLI is intentionally small and exists to install and maintain repository-readable method files safely.

## Repository integration

From a project repository:

```sh
pnpm dlx cnad-method init
```

This installs CNAD-managed method files under `.cnad/method/`, creates a project-owned `.cnad/project.md` when needed, and adds a small CNAD reference block to `AGENTS.md` without replacing existing instructions.

Check a future package update before applying it:

```sh
pnpm dlx cnad-method update --check
```

Apply it:

```sh
pnpm dlx cnad-method update
```

CNAD records hashes of the files it owns. If a CNAD-managed file has been edited locally, an update is blocked instead of silently overwriting the change.

Managed-file hashes normalize text line endings, so a normal Git checkout using CRLF on Windows does not count as a local edit. Manifest paths are also validated before any managed file is read or removed; only normalized descendants of `.cnad/method/` are accepted.

Core ownership rule:

> **CNAD-owned files can be upgraded automatically. Project-owned files must never be silently overwritten.**

## First dogfooding target

The first real consumer is [Moura](https://github.com/hy0044/moura). The package and update behavior should evolve from real usage rather than from speculative orchestration features.

## Initial workflow

- route the task by Low / Medium / High risk
- keep one primary implementation context while continuity is useful
- run relevant automated verification and self-review
- perform independent review for every code change
- scale review depth and human approval with risk
- review broadly, change narrowly

See the installed files under `.cnad/method/` for the repository-facing workflow.
