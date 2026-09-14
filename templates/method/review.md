# CNAD independent review

Independent review is required for every code change. Review depth scales with risk; the existence of the review does not.

## Minimum review context

Normally provide only the smallest useful evidence set:

- goal / requested behavior and relevant acceptance criteria
- actual diff or changed files
- relevant surrounding code when needed
- repository rules and conventions that materially constrain the implementation
- initial risk level
- relevant test, lint, type-check, CI, or other verification results

Do not pass the full implementation conversation, long reasoning trace, discarded alternatives, or persuasive implementation rationale by default.

## Output contract

```text
Verdict: APPROVE | REQUEST_CHANGES | ESCALATE_RISK

Blocking findings:
- ...

Non-blocking observations:
- ...

Risk:
- unchanged | Low → Medium | Medium → High
```

If there are no findings, state `None` rather than manufacturing comments.

## Scope discipline

- A technically valid finding is not automatically an implementation obligation. Before classifying it as Blocking or Non-blocking, determine whether it is inside the product's intended responsibility and support boundary.
- If a valid finding is outside that boundary, preserve the finding, confirm or document the boundary when needed, and do not expand the implementation scope.
- If it is inside the boundary, classify it by task and risk, then decide whether the current task should fix, defer, or reject it.
- Blocking / in-scope findings must be fixed in the current task.
- Non-blocking / out-of-scope improvements must not cause `REQUEST_CHANGES` by themselves.
- Critical security, privacy, data-integrity, production-safety, or similarly severe findings should trigger escalation.

A non-blocking suggestion may be `Accepted`, `Deferred`, or `Rejected`.

> A review suggestion is not an obligation.

> Do not lose useful improvements. Do not turn every suggestion into work.

> Review broadly. Change narrowly.
