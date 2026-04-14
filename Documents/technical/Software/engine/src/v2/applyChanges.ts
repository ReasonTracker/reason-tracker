// See 📌README.md in this folder for local coding standards before editing this file.

import type {
	ApplyIntentChangesRequest,
	ApplyIntentChangesResult,
} from "./api.ts";
import type {
	Change,
	Claim,
	Connector,
	Debate,
	Score,
} from "../../../contracts/src/v2/index.ts";
import { assertNever } from "./graph.ts";

export function applyIntentChanges(
	request: ApplyIntentChangesRequest,
): ApplyIntentChangesResult {
	return {
		debate: applyChanges(request.debate, request.changes ?? request.intent.changes),
	};
}

export function applyChanges(debate: Debate, changes: Change[]): Debate {
	let nextDebate = debate;
	for (const change of changes) {
		nextDebate = applyChange(nextDebate, change);
	}
	return nextDebate;
}

export function applyChange(debate: Debate, change: Change): Debate {
	switch (change.kind) {
		case "ClaimAdded":
			return {
				...debate,
				claims: {
					...debate.claims,
					[change.claim.id]: change.claim,
				},
			};
		case "ClaimRemoved": {
			const nextClaims = { ...debate.claims };
			delete nextClaims[change.claim.id];
			return {
				...debate,
				claims: nextClaims,
			};
		}
		case "ClaimContentChanged":
			return updateClaim(debate, change.claimId, {
				content: change.after.content,
			});
		case "ClaimSideChanged":
			return updateClaim(debate, change.claimId, {
				side: change.after.side,
			});
		case "ClaimForceConfidenceChanged":
			return updateClaim(debate, change.claimId, {
				forceConfidence: change.after.forceConfidence,
			});
		case "ConnectorAdded":
			return {
				...debate,
				connectors: {
					...debate.connectors,
					[change.connector.id]: change.connector,
				},
			};
		case "ConnectorRemoved": {
			const nextConnectors = { ...debate.connectors };
			delete nextConnectors[change.connector.id];
			return {
				...debate,
				connectors: nextConnectors,
			};
		}
		case "ConnectorSourceChanged":
			return updateConnector(debate, change.connectorId, {
				source: change.after.source,
			});
		case "ConnectorTargetChanged":
			return updateConnector(debate, change.connectorId, {
				target: change.after.target,
			});
		case "ConnectorAffectsChanged":
			return updateConnector(debate, change.connectorId, {
				affects: change.after.affects,
			});
		case "ScoreAdded":
			return {
				...debate,
				scores: {
					...debate.scores,
					[change.score.id]: change.score,
				},
			};
		case "ScoreRemoved": {
			const nextScores = { ...debate.scores };
			delete nextScores[change.score.id];
			return {
				...debate,
				scores: nextScores,
			};
		}
		case "IncomingSourceInserted":
		case "IncomingSourceRemoved":
		case "IncomingSourcesResorted":
			return updateScore(debate, change.targetScoreId, {
				incomingScoreIds: [...change.incomingScoreIds],
			});
		case "ScoreClaimConfidenceChanged":
			return updateScore(debate, change.scoreId, {
				claimConfidence: change.after.claimConfidence,
			});
		case "ScoreReversibleClaimConfidenceChanged":
			return updateScore(debate, change.scoreId, {
				reversibleClaimConfidence: change.after.reversibleClaimConfidence,
			});
		case "ScoreConnectorConfidenceChanged":
			return updateScore(debate, change.scoreId, {
				connectorConfidence: change.after.connectorConfidence,
			});
		case "ScoreRelevanceChanged":
			return updateScore(debate, change.scoreId, {
				relevance: change.after.relevance,
			});
		case "ScoreScaleOfSourcesChanged":
			return updateScore(debate, change.scoreId, {
				scaleOfSources: change.after.scaleOfSources,
			});
		default:
			return assertNever(change);
	}
}

function updateClaim(debate: Debate, claimId: Claim["id"], patch: Partial<Omit<Claim, "id">>): Debate {
	const claim = debate.claims[claimId];
	if (!claim) {
		throw new Error(`Claim ${claimId} was not found in the debate.`);
	}

	return {
		...debate,
		claims: {
			...debate.claims,
			[claimId]: {
				...claim,
				...patch,
				id: claim.id,
			},
		},
	};
}

function updateConnector(
	debate: Debate,
	connectorId: Connector["id"],
	patch: Partial<Omit<Connector, "id">>,
): Debate {
	const connector = debate.connectors[connectorId];
	if (!connector) {
		throw new Error(`Connector ${connectorId} was not found in the debate.`);
	}

	return {
		...debate,
		connectors: {
			...debate.connectors,
			[connectorId]: {
				...connector,
				...patch,
				id: connector.id,
			},
		},
	};
}

function updateScore(debate: Debate, scoreId: Score["id"], patch: Partial<Omit<Score, "id">>): Debate {
	const score = debate.scores[scoreId];
	if (!score) {
		throw new Error(`Score ${scoreId} was not found in the debate.`);
	}

	return {
		...debate,
		scores: {
			...debate.scores,
			[scoreId]: {
				...score,
				...patch,
				id: score.id,
			},
		},
	};
}
