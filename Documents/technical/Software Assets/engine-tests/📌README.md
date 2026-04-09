# 📌 Engine Tests

Core contract (canonical API)
step(state, transactions) -> (next_state, emitted_transactions)
Stateless, pure, deterministic
No assumptions about server-side memory or storage
Same input must always produce the same output
Semantics
State: complete graph representing current system state
Transactions: inputs that modify or trigger recalculation
Next state: fully calculated graph after applying transactions
Emitted transactions: minimal set of changes that transform the initial state into the next state
Required invariants

Every implementation must satisfy:

Determinism
Same state + transactions → same result
Replay correctness
Applying emitted_transactions to state must produce next_state

Closure / stability

step(next_state, []) -> (next_state, no meaningful emitted_transactions)
Equivalence
Different implementations must produce semantically equivalent results
Test model (portable spec)

Single unified test case format:

{
  "id": "case-name",
  "state": {...},
  "transactions": [...],
  "expect_state": {...},
  "expect_emitted_transactions": [...]
}

Test suite enforces:

state correctness
emitted transaction correctness
replay invariant
stability invariant

Tests are:

language-neutral (e.g., JSON/JSONL)
black-box
implementation-independent
Architecture boundary
Core engine: pure function (step)
Storage: external, not part of contract
Execution model: stateless at the interface level

Implementations may:

store state externally
maintain in-memory data
use any datastore

But none of that is part of the spec.

Context (optimization note)
Optional, opaque input/output
May be provided or ignored
Must not affect semantics
May be invalidated or rebuilt at any time (including across versions)
Used only to improve performance (e.g., indexing, memoization)
Versioning
Semantic behavior (step) → stable, versioned carefully
Context → not part of compatibility contract, disposable
Overall model

Stateless semantic core + optional stateful optimizations

Portable across languages
Easy to test (one-shot)
Easy to reimplement
No required datastore or plugin model
Performance handled outside the contract

<!-- autonav:start -->
- [Fixtures](./fixtures/📌README.md)
- [Src](./src/📌README.md)
- [Tests](./tests/📌README.md)
<!-- autonav:end -->
