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

## GitHub Pull Request completion signal

When reviewing a GitHub Pull Request, an `APPROVE` verdict should, when possible, also be signaled with a 👍 (`+1`) reaction on the Pull Request description. This is a lightweight, human-visible signal that the Independent Review completed with an `APPROVE` verdict.

- Add the reaction only after completing the Independent Review and reaching `APPROVE`.
- The reaction supplements the Output contract; it does not replace the Independent Review, its recorded verdict, or a formal GitHub Approval.
- Leave a review comment when the rationale, warnings, verification results, or non-blocking observations provide useful information for humans. When there is no useful additional information, do not create a redundant comment solely to accompany the reaction; continue to state `None` for empty finding sections in the review output.
- Do not add the approval-signaling reaction for `REQUEST_CHANGES` or `ESCALATE_RISK`; report blocking findings or the risk escalation through the Output contract instead.
- Treat the reaction as best-effort. If the GitHub API, permissions, or tooling does not allow it, the review can still complete successfully.

This signal is specific to GitHub Pull Requests. Independent Review in other environments remains complete through the Output contract without any equivalent reaction.

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
