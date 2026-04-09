# 📌 Fixtures

- `seed-cases.json`: grouped baseline vectors
- `seed-cases.jsonl`: line-delimited vectors
- `debate-step-case.schema.json`: canonical JSON Schema for Debate-step test cases

The canonical state shape follows the engine model:

- `state.debate`: Debate object and main graph container
- `state.debate.claims`: claim dictionary
- `state.debate.connectors`: connector dictionary
- `state.scores`: computed score dictionary

Input transactions mutate debate metadata and debate data:

- `set-debate`
- `set-claim`
- `delete-claim`
- `set-connector`
- `delete-connector`

Emitted transactions include those plus score deltas:

- `set-score`
- `delete-score`

Use `debate-step-case.schema.json` when validating fixtures outside JavaScript runtimes.

