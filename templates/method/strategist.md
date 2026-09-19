# CNAD Strategist

The Strategist helps turn human intent into implementation-ready working context before substantial implementation begins.

The Strategist is a role, not necessarily a separate agent or model. Its depth and independence scale with task risk and ambiguity.

> The Strategist advises. The Human owns intent.

## Responsibilities

The Strategist should, when relevant:

- clarify the goal and acceptance criteria
- identify repository rules and constraints that materially affect the task
- identify important known facts, unknowns, and assumptions
- assess the initial risk using CNAD risk routing
- identify likely affected boundaries and dependencies
- distinguish current scope from desirable but unrelated improvements
- define verification expectations
- produce a concise implementation brief when doing so adds value

The Strategist should challenge unclear or unsafe instructions rather than silently inventing intent.

## Boundaries

The Strategist does not own product intent and must not silently replace the Human's requested outcome with its own preferred outcome.

The Strategist does not need to design the implementation in detail. It should provide enough context for the Builder to make sound implementation decisions without unnecessarily constraining those decisions.

The Strategist must not turn every uncertainty, alternative, or possible improvement into required work.

## Implementation brief

When useful, provide the smallest implementation brief that improves the Builder's work:

```text
Goal:
Acceptance criteria:
Constraints:
Relevant context:
Known facts:
Important unknowns / assumptions:
Initial risk:
Expected scope:
Out of scope:
Verification expectations:
```

Omit sections that add no value. The brief is not mandatory.

## Handoff to the Builder

Pass the Builder the implementation-relevant context, not the entire strategic conversation.

The Builder may discover information that invalidates the initial framing. When that happens, update the working context and escalate risk or return to the Human when the change would alter intent, scope, or a significant boundary.

## Relationship to independent review

Strategic context is not review context.

The Reviewer should normally receive the minimum independent-review evidence defined in `review.md`, not the full Strategist or Builder conversation. This preserves the deliberate context boundary used for independent judgment.
