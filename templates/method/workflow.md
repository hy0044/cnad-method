# CNAD workflow

CNAD optimizes for deliberate context design before implementation, useful context continuity while building, and deliberate context boundaries for independent judgment.

> **Design the context. Preserve it while building. Break it when judging.**

## Roles

CNAD separates three responsibilities. They are roles, not necessarily separate tools or agents.

- **Strategist** — helps turn human intent into implementation-ready working context.
- **Builder** — owns implementation and keeps useful implementation context while working.
- **Reviewer** — independently judges the resulting change across the review boundary.
- **Human** — owns intent and any approval required by the risk level.

> The Strategist advises. The Human owns intent.

> The Builder owns implementation, not intent.

> The Reviewer judges the result, not the implementation story.

## Default flow

1. The Strategist clarifies the goal, constraints, repository rules, acceptance criteria, important unknowns, and likely impact to the depth justified by risk and ambiguity.
2. Route the task as Low, Medium, or High risk using the strongest relevant signal.
3. Produce an implementation brief when it improves implementation. Do not create one merely because the template exists.
4. The Builder implements with one primary working context when continuity remains useful.
5. Run relevant automated checks and self-review.
6. Perform an independent review for every code change.
7. Apply additional verification and human approval when the risk requires it.

For Low-risk work, strategic framing may be lightweight and performed in the same working context as implementation. Medium- and High-risk work benefit more strongly from an explicit Strategist step. High-risk work should make the proposed intent, boundaries, and verification expectations visible to the Human before substantial implementation begins.

> Preserve context during implementation. Reset context for independent judgment.

> Review broadly. Change narrowly.

## Copy-safe Human handoff

When the Builder returns an artifact intended for the Human to copy into another tool, agent, or system, copy/paste integrity is part of the handoff contract. This applies to artifacts such as Markdown, SQL, YAML, JSON, prompts, and Issue or PR bodies—not to ordinary conversational explanations.

Treat explicit requests such as “ready to paste” or “summarize in Markdown” as copy-safe handoffs. Do the same when wording such as “put it together” clearly implies reuse elsewhere; do not ask the Human to confirm the format when the context already establishes that intent.

- Return the artifact as one continuous copy-safe block when practical; do not needlessly split it across Markdown blocks.
- Keep explanations, progress reports, and side comments outside the artifact.
- Choose a wrapper that preserves the artifact's structure after copying. For example, when a Markdown artifact contains fenced code blocks, use an outer fence longer than any fence inside it.
- Before handoff, verify that delimiters and fences match and that copying the complete artifact preserves its intended structure.

> **If the Human carries the artifact, preserve it across the handoff.**

## Safe failure and escalation

CNAD favors useful autonomy over constant interruption. The Builder should investigate, verify, and retry within the authorized task boundary when reasonable rather than escalating every uncertainty to the Human.

When safe, authorized paths have been reasonably exhausted and meaningful progress still cannot be made, stop and escalate to the Human with the relevant evidence, attempts, and unresolved decision.

> **When the safe path runs out, escalate—do not expand the boundary.**

Failure to make progress does not authorize the Builder to widen permissions, scope, security boundaries, external-system access, or the Human's stated intent. Suspected broken requirements, impossible tasks, contradictory constraints, or missing authority are valid reasons to escalate rather than improvise beyond the boundary.

## CNAD Active Indicator

When CNAD materially informs a user-facing response, begin that response with the standalone indicator:

```text
Ⓒ
```

`Ⓒ` means **CNAD Active Indicator**: "CNAD was applied to this response." Use it when CNAD working context, workflow, risk routing, role boundaries, verification expectations, or another CNAD decision rule actually shaped the response. Merely finding `.cnad/`, reading a CNAD file, or seeing the CNAD reference in `AGENTS.md` is not enough.

The indicator is a self-reported activity signal. It is **not** a certification of CNAD compliance, a guarantee of correctness, or evidence that independent review or verification is complete. Never use it as a substitute for either.

Apply the indicator to human-visible AI responses, not mechanically to tool calls, logs, machine-readable JSON, commit messages, source code, generated files, or other content where the marker could alter meaning or break the artifact. Keep the standalone `Ⓒ` as the normal form rather than expanding it into a noisier label.

## Implementation brief

When useful, the Strategist produces a concise implementation brief containing only context that improves implementation. It may include:

- goal
- acceptance criteria
- constraints and relevant repository rules
- known facts
- important unknowns and assumptions
- initial risk
- expected scope
- out of scope
- verification expectations

The brief is a working-context boundary between strategic framing and implementation, not a mandatory document or a substitute for repository instructions.

## From finding to implementation

> A valid finding or desirable improvement is not automatically an implementation obligation.

Apply this to review findings, implementation and refactoring suggestions, best practices, tooling improvements, and pre-release improvements:

1. Confirm that the finding or improvement is valid or useful.
2. Decide whether it is inside the product's intended responsibility and support boundary. If not, preserve the finding, clarify or document the boundary when needed, and do not implement it.
3. If it is inside the boundary, decide whether it is required for the current task or release goal. If so, classify it and act.
4. If it is not currently required, include only the minimum safeguard when deferral would create unacceptable quality or risk; otherwise, defer it.

A desirable improvement is not automatically a release blocker. Ship the minimum structure required for confidence, not the maximum structure that could be useful later.

Artifacts should exist only when they improve implementation, verification, traceability, or maintenance.
