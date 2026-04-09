function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function deepClone(value) {
	if (value === undefined) {
		return undefined;
	}
	return JSON.parse(JSON.stringify(value));
}

function txKey(tx) {
	const kind = tx.kind ?? "";
	const id = tx.claimId ?? tx.connectorId ?? tx.scoreId ?? tx.debate?.id ?? tx.claim?.id ?? tx.connector?.id ?? "";
	return `${kind}:${id}`;
}

function compareTransactions(a, b) {
	const aKey = txKey(a);
	const bKey = txKey(b);
	if (aKey < bKey) {
		return -1;
	}
	if (aKey > bKey) {
		return 1;
	}
	return 0;
}

export function normalizeTransactions(transactions = []) {
	return [...transactions].map((tx) => deepClone(tx)).sort(compareTransactions);
}

function ensureStateShape(state) {
	const next = deepClone(state) ?? {};
	if (!isObject(next.debate)) {
		next.debate = {};
	}
	if (!isObject(next.debateData)) {
		next.debateData = {};
	}
	if (!isObject(next.debateData.claims)) {
		next.debateData.claims = {};
	}
	if (!isObject(next.debateData.connectors)) {
		next.debateData.connectors = {};
	}
	if (!isObject(next.scores)) {
		next.scores = {};
	}
	return next;
}

export function applyTransactions(state, transactions = []) {
	const next = ensureStateShape(state);

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
			continue;
		}

		if (tx.kind === "set-connector" && tx.connector?.id) {
			next.debateData.connectors[tx.connector.id] = deepClone(tx.connector);
			continue;
		}

		if (tx.kind === "delete-connector" && tx.connectorId) {
			delete next.debateData.connectors[tx.connectorId];
			continue;
		}

		if (tx.kind === "set-score" && tx.scoreId) {
			next.scores[tx.scoreId] = deepClone(tx.score);
			continue;
		}

		if (tx.kind === "delete-score" && tx.scoreId) {
			delete next.scores[tx.scoreId];
		}
	}

	return next;
}

export function normalizeValue(value) {
	if (Array.isArray(value)) {
		return value.map(normalizeValue);
	}

	if (!isObject(value)) {
		return value;
	}

	const keys = Object.keys(value).sort();
	const out = {};
	for (const key of keys) {
		out[key] = normalizeValue(value[key]);
	}
	return out;
}

export function semanticEqual(left, right) {
	return JSON.stringify(normalizeValue(left)) === JSON.stringify(normalizeValue(right));
}

export function hasMeaningfulTransactions(state, transactions = []) {
	if (transactions.length === 0) {
		return false;
	}

	const after = applyTransactions(state, transactions);
	return !semanticEqual(state, after);
}
