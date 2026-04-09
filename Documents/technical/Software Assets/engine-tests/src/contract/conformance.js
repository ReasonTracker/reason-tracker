import {
  applyTransactions,
  deepClone,
  hasMeaningfulTransactions,
  normalizeTransactions,
  semanticEqual
} from "./transactions.js";
import { validateCase } from "./validateCase.js";

function assertSemanticEqual(actual, expected, message) {
  if (!semanticEqual(actual, expected)) {
    throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

function assertTransactionsEqual(actual, expected, message) {
  const normalizedActual = normalizeTransactions(actual);
  const normalizedExpected = normalizeTransactions(expected);
  assertSemanticEqual(normalizedActual, normalizedExpected, message);
}

export function runConformanceCase(adapter, testCase) {
  const validationErrors = validateCase(testCase);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid case '${testCase.id ?? "unknown"}': ${validationErrors.join(" ")}`);
  }

  const stateA = deepClone(testCase.state);
  const txA = deepClone(testCase.transactions);
  const stateB = deepClone(testCase.state);
  const txB = deepClone(testCase.transactions);

  const first = adapter.step(stateA, txA, deepClone(testCase.context));
  const second = adapter.step(stateB, txB, deepClone(testCase.context));

  assertSemanticEqual(first.next_state, second.next_state, `Determinism failed for ${testCase.id}: next_state differs between runs.`);
  assertTransactionsEqual(
    first.emitted_transactions,
    second.emitted_transactions,
    `Determinism failed for ${testCase.id}: emitted_transactions differ between runs.`
  );

  assertSemanticEqual(first.next_state, testCase.expect_state, `State correctness failed for ${testCase.id}.`);
  assertTransactionsEqual(
    first.emitted_transactions,
    testCase.expect_emitted_transactions,
    `Emitted transaction correctness failed for ${testCase.id}.`
  );

  const replayedState = applyTransactions(testCase.state, first.emitted_transactions);
  assertSemanticEqual(replayedState, first.next_state, `Replay correctness failed for ${testCase.id}.`);

  const stability = adapter.step(deepClone(first.next_state), [], deepClone(testCase.context));
  assertSemanticEqual(stability.next_state, first.next_state, `Stability failed for ${testCase.id}: next_state changed with empty transactions.`);

  if (hasMeaningfulTransactions(first.next_state, stability.emitted_transactions)) {
    throw new Error(`Stability failed for ${testCase.id}: meaningful emitted transactions returned with empty input.`);
  }
}
