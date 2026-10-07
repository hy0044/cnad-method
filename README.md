# CNAD Method

**CNAD — Context-Native AI Development** is an experimental development method for AI-assisted software engineering.

CNAD designs useful working context before implementation, preserves that context for as long as it adds value, scales process with risk, and introduces a deliberate context boundary for independent review.

> **Design the context. Preserve it while building. Break it when judging.**

CNAD separates three responsibilities: the **Strategist** helps turn human intent into implementation-ready context, the **Builder** owns implementation, and the **Reviewer** independently judges the resulting change. These are roles, not necessarily separate tools or agents; the process scales with risk.

> The Strategist advises. The Human owns intent.
>
> The Builder owns implementation, not intent.
>
> The Reviewer judges the result, not the implementation story.

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

CNAD records hashes of the files it owns. In an ordinary Git-managed workflow, if a CNAD-managed file has been edited locally, an update is blocked instead of silently overwriting the change.

Managed-file hashes normalize text line endings, so a normal Git checkout using CRLF on Windows does not count as a local edit. Manifest paths are also validated before any managed file is read or removed; only normalized descendants of `.cnad/method/` are accepted.

Core ownership rule:

> **CNAD-owned files can be upgraded automatically. Project-owned files must never be silently overwritten.**

### v0.1 update-safety guarantee

`cnad update` assumes an ordinary Git-managed working tree. The repository must be a Git repository, and existing CNAD-managed files, including `.cnad/version.json`, must be tracked and have no uncommitted changes detectable by normal Git diff semantics. Under those conditions, ordinary local modifications are rejected before an update.

Special Git index states and customizations are outside the v0.1 update-safety guarantee. This includes `skip-worktree`, `assume-unchanged`, custom clean/smudge filter edge cases, and other special index configurations.

Git is the rollback boundary: CNAD supports ordinary Git-managed workflows rather than reimplementing Git or guaranteeing recovery for every specialized Git configuration. CNAD does not provide transactional rollback for failed updates. After a failed update, inspect the working tree with `git status` and `git diff`, then restore or clean changes as appropriate before retrying (for example, preview untracked cleanup with `git clean -n -- .cnad/`).

## First dogfooding target

The first real consumer is [Moura](https://github.com/hy0044/moura). The package and update behavior should evolve from real usage rather than from speculative orchestration features.

## Initial workflow

- turn human intent into implementation-ready context at the depth justified by risk and ambiguity
- route the task by Low / Medium / High risk
- keep one primary implementation context while continuity is useful
- run relevant automated verification and self-review
- optionally use a pre-PR Independent Review as an early quality gate, fixing and re-verifying Blocking / in-scope findings
- perform independent review of every completed code change; in GitHub PR workflows, review the completed PR from fresh context after creation even when pre-PR review has run
- scale review depth and human approval with risk
- review broadly, change narrowly

See the installed files under `.cnad/method/` for the repository-facing workflow.

## CNAD Active Indicator

When CNAD materially informs a user-facing AI response, the response begins with a standalone `Ⓒ1` through `Ⓒ5`. The integer is a self-assessment of adherence to the CNAD principles and steps applicable to that task, from insufficient application (1) to sufficient application (5). It does not score answer quality or confidence.

Even `Ⓒ5` is a self-reported signal, not a certification of CNAD compliance, a correctness guarantee, or proof that Independent Review or verification is complete. Adherence depends on necessary and sufficient process for the task's risk, ambiguity, and impact; extra steps do not earn a higher score, and a simple Low-risk task can merit `Ⓒ5`.

Omit the indicator when CNAD did not materially inform the response. The former bare `Ⓒ` is a legacy activity signal with no adherence rating. See [the workflow](templates/method/workflow.md#cnad-active-indicator) for all five levels and display rules.

## Releases

Maintainer instructions for publishing releases to npm, including the one-time npm account, initial publication, and Trusted Publisher setup, are in [the release guide](docs/releasing.md).
