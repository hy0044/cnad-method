# CNAD risk routing

Risk assessment is initial routing, not a scoring exercise. Classify by the strongest relevant signal.

## Low

A local implementation change that does not intentionally alter existing design, contracts, shared behavior, security boundaries, or persistent data semantics.

Review focus:

> Is this change locally correct, minimal, and does it look like it belongs in this codebase?

## Medium

A change that affects shared components, existing internal contracts, abstractions, or meaningful shared behavior while operating within the existing design.

Review focus:

> Does this change fit correctly within the existing design?

## High

A change that intentionally alters design, architectural boundaries, contracts, schemas, security-sensitive behavior, critical data semantics, or another high-impact boundary. A single strong security, privacy, data-integrity, reversibility, or operational signal may also make a change High risk.

Review focus:

> Is the proposed design, boundary, or contract change itself justified, safe, and verifiable?

## Escalation

Initial risk is provisional. Independent review may return `ESCALATE_RISK` when implementation reveals broader impact or stronger risk than initially understood.
