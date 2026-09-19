# CNAD risk routing

Risk assessment is initial routing, not a scoring exercise. Classify by the strongest relevant signal.

## Low

Strategic framing may be lightweight and may remain in the Builder's working context. A separate Strategist context is optional unless ambiguity or uncertainty makes it useful.

A local implementation change that does not intentionally alter existing design, contracts, shared behavior, security boundaries, or persistent data semantics.

Review focus:

> Is this change locally correct, minimal, and does it look like it belongs in this codebase?

## Medium

Use an explicit Strategist step when it materially improves scope, constraints, risk understanding, or verification expectations before implementation.

A change that affects shared components, existing internal contracts, abstractions, or meaningful shared behavior while operating within the existing design.

Review focus:

> Does this change fit correctly within the existing design?

## High

Use an explicit Strategist step before substantial implementation. Make the proposed intent, affected boundaries, important unknowns, and verification expectations visible to the Human before proceeding. Human approval remains the authority for intent and any required high-risk gate.

A change that intentionally alters design, architectural boundaries, contracts, schemas, security-sensitive behavior, critical data semantics, or another high-impact boundary. A single strong security, privacy, data-integrity, reversibility, or operational signal may also make a change High risk.

Review focus:

> Is the proposed design, boundary, or contract change itself justified, safe, and verifiable?

## Escalation

Initial risk is provisional. Independent review may return `ESCALATE_RISK` when implementation reveals broader impact or stronger risk than initially understood.
