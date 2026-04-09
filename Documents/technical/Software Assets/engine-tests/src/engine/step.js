import { deepClone, semanticEqual } from "../contract/transactions.js";
import { calculateScores } from "./scoring.js";

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

function applyInputTransactions(state, transactions = []) {
  const next = deepClone(state);

  for (const tx of transactions) {
    if (tx.kind === "set-debate" && tx.debate) {
      next.debate = deepClone(tx.debate);
      continue;
    }

    if (tx.kind === "set-claim" && tx.claim?.id) {
      next.debateData.claims[tx.claim.id] = deepClone(tx.claim);
      continue;
    }

    if (tx.kind === "delete-claim" && tx.claimId) {
      delete next.debateData.claims[tx.claimId];
      for (const connectorId of Object.keys(next.debateData.connectors)) {
        const connector = next.debateData.connectors[connectorId];
        if (connector.source === tx.claimId || connector.target === tx.claimId) {
          delete next.debateData.connectors[connectorId];
        }
      }
      continue;
    }

    if (tx.kind === "set-connector" && tx.connector?.id) {
      next.debateData.connectors[tx.connector.id] = deepClone(tx.connector);
      continue;
    }

    if (tx.kind === "delete-connector" && tx.connectorId) {
      delete next.debateData.connectors[tx.connectorId];
    }
  }

  return next;
}

export function stepEngine(state, transactions) {
  const prev = deepClone(state);
  const next = applyInputTransactions(prev, transactions);
  next.scores = calculateScores(next.debateData);

  const emitted = [
    ...diffMap({ _: prev.debate }, { _: next.debate }, "set-debate", "delete-debate", "debateId", "debate"),
    ...diffMap(
      prev.debateData.claims,
      next.debateData.claims,
      "set-claim",
      "delete-claim",
      "claimId",
      "claim"
    ),
    ...diffMap(
      prev.debateData.connectors,
      next.debateData.connectors,
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
