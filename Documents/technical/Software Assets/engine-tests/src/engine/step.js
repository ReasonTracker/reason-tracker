import { deepClone, semanticEqual } from "../contract/transactions.js";
import { calculateScores } from "./scoring.js";

/** @typedef {import("@reasontracker/contracts").DebateStepState} DebateStepState */
/** @typedef {import("@reasontracker/contracts").EmittedTransaction} EmittedTransaction */
/** @typedef {import("@reasontracker/contracts").InputTransaction} InputTransaction */

function diffMap(prev, next, setKind, deleteKind, idField, valueField) {
  const txs = [];
  const ids = new Set([...Object.keys(prev), ...Object.keys(next)]);

  for (const id of ids) {
    if (!(id in next)) {
      txs.push({ kind: deleteKind, [idField]: id });
      continue;
    }
    if (!(id in prev) || !semanticEqual(prev[id], next[id])) {
      txs.push({ kind: setKind, [idField]: id, [valueField]: deepClone(next[id]) });
    }
  }

  return txs;
}

function debateMeta(debate) {
  return {
    id: debate?.id,
    type: debate?.type,
    name: debate?.name,
    description: debate?.description,
    mainClaimId: debate?.mainClaimId
  };
}

function applyInputTransactions(state, transactions = []) {
  const next = deepClone(state);

  for (const tx of transactions) {
    if (tx.kind === "set-debate" && tx.debate) {
      next.debate = deepClone(tx.debate);
      continue;
    }

    if (tx.kind === "set-claim" && tx.claim?.id) {
      next.debate.claims[tx.claim.id] = deepClone(tx.claim);
      continue;
    }

    if (tx.kind === "delete-claim" && tx.claimId) {
      delete next.debate.claims[tx.claimId];
      for (const connectorId of Object.keys(next.debate.connectors)) {
        const connector = next.debate.connectors[connectorId];
        if (connector.source === tx.claimId || connector.target === tx.claimId) {
          delete next.debate.connectors[connectorId];
        }
      }
      continue;
    }

    if (tx.kind === "set-connector" && tx.connector?.id) {
      next.debate.connectors[tx.connector.id] = deepClone(tx.connector);
      continue;
    }

    if (tx.kind === "delete-connector" && tx.connectorId) {
      delete next.debate.connectors[tx.connectorId];
    }
  }

  return next;
}

/**
 * @param {DebateStepState} state
 * @param {InputTransaction[]} transactions
 * @returns {{ next_state: DebateStepState, emitted_transactions: EmittedTransaction[] }}
 */
export function stepEngine(state, transactions) {
  const prev = deepClone(state);
  const next = applyInputTransactions(prev, transactions);
  next.scores = calculateScores(next.debate);

  const emitted = [
    ...diffMap({ _: debateMeta(prev.debate) }, { _: debateMeta(next.debate) }, "set-debate", "delete-debate", "debateId", "debate"),
    ...diffMap(
      prev.debate.claims,
      next.debate.claims,
      "set-claim",
      "delete-claim",
      "claimId",
      "claim"
    ),
    ...diffMap(
      prev.debate.connectors,
      next.debate.connectors,
      "set-connector",
      "delete-connector",
      "connectorId",
      "connector"
    ),
    ...diffMap(prev.scores, next.scores, "set-score", "delete-score", "scoreId", "score")
  ].filter((tx) => tx.kind !== "delete-debate");

  return {
    next_state: next,
    emitted_transactions: emitted
  };
}
