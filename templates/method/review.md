# CNAD independent review

Independent review is required for every code change. Review depth scales with risk; the existence of the review does not.

## Review timing and boundaries

### Pre-PR Independent Review

During Builder implementation or before PR creation, a separate Reviewer with fresh context may perform Independent Review as an optional **pre-PR quality gate**. Its purpose is to find problems early so the Builder can fix and re-verify before submitting the PR.

Use the same minimum review context, Output contract, scope discipline, and risk routing as any Independent Review. Blocking / in-scope findings must be fixed and relevant verification re-run before proceeding to PR creation. Findings that require escalation still follow `risk-routing.md`; this gate does not authorize broader scope or changes to Human intent.

### PR Independent Review

In a normal GitHub Pull Request workflow, Independent Review must occur after PR creation, even when pre-PR Independent Review has already run. Judge the completed PR diff from fresh context using the minimum review evidence below. If changes are required, the Builder fixes and verifies them within scope, then submits the updated PR for re-review before the Human final gate.

Pre-PR review and PR review are separate review boundaries. A pre-PR `APPROVE` applies only to the change reviewed at that gate; it must not be carried forward as completion or approval of the later PR. Reset review context at the PR boundary rather than continuing the pre-PR review conversation or inheriting the Builder's implementation story. Independence depends on fresh context and independent judgment, not a different product or model.

GitHub PRs are not required for CNAD. In other environments, independently judge the completed change from fresh context and record the verdict through the Output contract before the Human final gate; an early quality gate does not replace that completed-change review.

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

- Add the reaction only after completing Independent Review of that PR itself and reaching `APPROVE`.
- A pre-PR `APPROVE` does not authorize an approval-signaling reaction on a subsequently created PR. Complete the separate PR Independent Review first.
- The reaction supplements the Output contract; it does not replace the Independent Review, its recorded verdict, or a formal GitHub Approval.
- Leave a review comment when the rationale, warnings, verification results, or non-blocking observations provide useful information for humans. When there is no useful additional information, do not create a redundant comment solely to accompany the reaction; continue to state `None` for empty finding sections in the review output.
- Do not add the approval-signaling reaction for `REQUEST_CHANGES` or `ESCALATE_RISK`. On re-review, if you previously added that reaction, remove it when possible so that it does not signal a stale approval; never remove another person's reaction. Report blocking findings or the risk escalation through the Output contract instead.
- Treat adding or removing the reaction as best-effort. If the GitHub API, permissions, or tooling does not allow it, the review can still complete successfully.

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
