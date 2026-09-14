# CNAD workflow

CNAD optimizes for useful context continuity during implementation and deliberate context boundaries for independent judgment.

## Default flow

1. Understand the goal, constraints, repository rules, and likely impact.
2. Route the task as Low, Medium, or High risk using the strongest relevant signal.
3. Plan only to the depth justified by the risk and ambiguity.
4. Implement with one primary working context when continuity remains useful.
5. Run relevant automated checks and self-review.
6. Perform an independent review for every code change.
7. Apply additional verification and human approval when the risk requires it.

> Preserve context during implementation. Reset context for independent judgment.

> Review broadly. Change narrowly.

## From finding to implementation

> A valid finding or desirable improvement is not automatically an implementation obligation.

Apply this to review findings, implementation and refactoring suggestions, best practices, tooling improvements, and pre-release improvements:

1. Confirm that the finding or improvement is valid or useful.
2. Decide whether it is inside the product's intended responsibility and support boundary. If not, preserve the finding, clarify or document the boundary when needed, and do not implement it.
3. If it is inside the boundary, decide whether it is required for the current task or release goal. If so, classify it and act.
4. If it is not currently required, include only the minimum safeguard when deferral would create unacceptable quality or risk; otherwise, defer it.

A desirable improvement is not automatically a release blocker. Ship the minimum structure required for confidence, not the maximum structure that could be useful later.

Artifacts should exist only when they improve implementation, verification, traceability, or maintenance.
