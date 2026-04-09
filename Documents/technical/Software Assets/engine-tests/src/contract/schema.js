export const INPUT_TRANSACTION_KINDS = [
  "set-debate",
  "set-claim",
  "delete-claim",
  "set-connector",
  "delete-connector"
];

export const EMITTED_TRANSACTION_KINDS = [...INPUT_TRANSACTION_KINDS, "set-score", "delete-score"];

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isDebateLike(value) {
  return (
    isPlainObject(value) &&
    value.type === "debate" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    isPlainObject(value.claims) &&
    isPlainObject(value.connectors)
  );
}

export function isClaimLike(value) {
  return (
    isPlainObject(value) &&
    value.type === "claim" &&
    typeof value.id === "string" &&
    typeof value.content === "string" &&
    (value.pol === "pro" || value.pol === "con")
  );
}

export function isConnectorLike(value) {
  return (
    isPlainObject(value) &&
    value.type === "connector" &&
    typeof value.id === "string" &&
    typeof value.source === "string" &&
    typeof value.target === "string" &&
    typeof value.proTarget === "boolean" &&
    (value.affects === "confidence" || value.affects === "relevance")
  );
}

export function isScoreLike(value) {
  return (
    isPlainObject(value) &&
    value.type === "score" &&
    typeof value.id === "string" &&
    typeof value.confidence === "number" &&
    typeof value.reversibleConfidence === "number" &&
    typeof value.relevance === "number"
  );
}

export function validateStateShape(state, label) {
  const errors = [];

  if (!isPlainObject(state)) {
    errors.push(`${label} must be an object.`);
    return errors;
  }

  if (!isDebateLike(state.debate)) {
    errors.push(`${label}.debate must be a Debate-shaped object.`);
  }

  if (!isPlainObject(state.scores)) {
    errors.push(`${label}.scores must be an object.`);
  }

  for (const claim of Object.values(state.debate?.claims ?? {})) {
    if (!isClaimLike(claim)) {
      errors.push(`${label}.debate.claims contains a non-Claim value.`);
      break;
    }
  }

  for (const connector of Object.values(state.debate?.connectors ?? {})) {
    if (!isConnectorLike(connector)) {
      errors.push(`${label}.debate.connectors contains a non-Connector value.`);
      break;
    }
  }

  for (const score of Object.values(state.scores ?? {})) {
    if (!isScoreLike(score)) {
      errors.push(`${label}.scores contains a non-Score value.`);
      break;
    }
  }

  return errors;
}

function validateInputTransactionShape(tx, index) {
  const errors = [];
  const prefix = `transactions[${index}]`;

  if (!isPlainObject(tx)) {
    return [`${prefix} must be an object.`];
  }

  if (!INPUT_TRANSACTION_KINDS.includes(tx.kind)) {
    return [`${prefix}.kind must be one of ${INPUT_TRANSACTION_KINDS.join(", ")}.`];
  }

  if (tx.kind === "set-debate" && !isDebateLike(tx.debate)) {
    errors.push(`${prefix} set-debate must include Debate-shaped debate.`);
  }

  if (tx.kind === "set-claim" && !isClaimLike(tx.claim)) {
    errors.push(`${prefix} set-claim must include Claim-shaped claim.`);
  }

  if (tx.kind === "delete-claim" && typeof tx.claimId !== "string") {
    errors.push(`${prefix} delete-claim must include claimId.`);
  }

  if (tx.kind === "set-connector" && !isConnectorLike(tx.connector)) {
    errors.push(`${prefix} set-connector must include Connector-shaped connector.`);
  }

  if (tx.kind === "delete-connector" && typeof tx.connectorId !== "string") {
    errors.push(`${prefix} delete-connector must include connectorId.`);
  }

  return errors;
}

function validateEmittedTransactionShape(tx, index) {
  const errors = [];
  const prefix = `expect_emitted_transactions[${index}]`;

  if (!isPlainObject(tx)) {
    return [`${prefix} must be an object.`];
  }

  if (!EMITTED_TRANSACTION_KINDS.includes(tx.kind)) {
    return [`${prefix}.kind must be one of ${EMITTED_TRANSACTION_KINDS.join(", ")}.`];
  }

  if (tx.kind === "set-debate" && !isDebateLike(tx.debate)) {
    errors.push(`${prefix} set-debate must include Debate-shaped debate.`);
  }

  if (tx.kind === "set-claim" && (!isClaimLike(tx.claim) || typeof tx.claimId !== "string")) {
    errors.push(`${prefix} set-claim must include claimId and Claim-shaped claim.`);
  }

  if (tx.kind === "delete-claim" && typeof tx.claimId !== "string") {
    errors.push(`${prefix} delete-claim must include claimId.`);
  }

  if (tx.kind === "set-connector" && (!isConnectorLike(tx.connector) || typeof tx.connectorId !== "string")) {
    errors.push(`${prefix} set-connector must include connectorId and Connector-shaped connector.`);
  }

  if (tx.kind === "delete-connector" && typeof tx.connectorId !== "string") {
    errors.push(`${prefix} delete-connector must include connectorId.`);
  }

  if (tx.kind === "set-score" && (!isScoreLike(tx.score) || typeof tx.scoreId !== "string")) {
    errors.push(`${prefix} set-score must include scoreId and Score-shaped score.`);
  }

  if (tx.kind === "delete-score" && typeof tx.scoreId !== "string") {
    errors.push(`${prefix} delete-score must include scoreId.`);
  }

  return errors;
}

export function validateInputTransactions(transactions = []) {
  const errors = [];
  if (!Array.isArray(transactions)) {
    return ["transactions must be an array."];
  }

  transactions.forEach((tx, index) => {
    errors.push(...validateInputTransactionShape(tx, index));
  });

  return errors;
}

export function validateEmittedTransactions(transactions = []) {
  const errors = [];
  if (!Array.isArray(transactions)) {
    return ["expect_emitted_transactions must be an array."];
  }

  transactions.forEach((tx, index) => {
    errors.push(...validateEmittedTransactionShape(tx, index));
  });

  return errors;
}
