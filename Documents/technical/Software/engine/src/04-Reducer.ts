import type { DebateMetadataPatch } from "./01-Commands.ts"
import type { Claim, ClaimId, ClaimPatch } from "./00-entities/Claim.ts"
import type { Connector, ConnectorId } from "./00-entities/Connector.ts"
import type { Debate } from "./00-entities/Debate.ts"
import type { Score, ScoreId, ScorePatch, ScoreScalePatch } from "./00-entities/Score.ts"
import type { Operation } from "./03-Operations.ts"

export class Reducer {
	apply(state: Debate | undefined, operation: Operation): Debate {
		switch (operation.type) {
			case "DebateCreated":
				return cloneDebate(operation.debate)
			case "DebateUpdated":
				return applyDebatePatch(requireState(state, operation.type), operation.patch)
			case "ClaimAdded":
				return addClaim(requireState(state, operation.type), operation.claim)
			case "ClaimUpdated":
				return applyClaimPatch(requireState(state, operation.type), operation.patch)
			case "ClaimDeleted":
				return deleteClaim(requireState(state, operation.type), operation.claimId)
			case "ConnectorAdded":
				return addConnector(requireState(state, operation.type), operation.connector)
			case "ConnectorDeleted":
				return deleteConnector(requireState(state, operation.type), operation.connectorId)
			case "ScoreAdded":
				return addScore(requireState(state, operation.type), operation.score)
			case "ScoreUpdated":
				return applyScorePatches(requireState(state, operation.type), operation.patches)
			case "scaleOfSources":
				return applyScaleOfSourcesPatches(requireState(state, operation.type), operation.patches)
			case "ScoreDeleted":
				return deleteScore(requireState(state, operation.type), operation.scoreId)
			default: {
				const unsupportedOperation: never = operation
				throw new Error(`Unsupported reducer operation ${(unsupportedOperation as Operation).type}.`)
			}
		}
	}
}

function requireState(state: Debate | undefined, operationType: Operation["type"]): Debate {
	if (state) {
		return state
	}

	throw new Error(`${operationType} requires an existing debate state.`)
}

function cloneDebate(debate: Debate): Debate {
	const claims = {} as Debate["claims"]
	const connectors = {} as Debate["connectors"]
	const scores = {} as Debate["scores"]

	for (const claim of Object.values(debate.claims)) {
		claims[claim.id] = cloneClaim(claim)
	}

	for (const connector of Object.values(debate.connectors)) {
		connectors[connector.id] = cloneConnector(connector)
	}

	for (const score of Object.values(debate.scores)) {
		scores[score.id] = cloneScore(score)
	}

	return {
		...debate,
		claims,
		connectors,
		scores,
	}
}

function cloneClaim(claim: Claim): Claim {
	return {
		...claim,
	}
}

function cloneConnector(connector: Connector): Connector {
	return {
		...connector,
	}
}

function cloneScore(score: Score): Score {
	return {
		...score,
		incomingScoreIds: [...score.incomingScoreIds],
	}
}

function applyDebatePatch(debate: Debate, patch: DebateMetadataPatch): Debate {
	if (patch.id !== debate.id) {
		throw new Error(`Debate patch targeted ${patch.id}, but current debate is ${debate.id}.`)
	}

	if (!hasOwn(patch, "name") && !hasOwn(patch, "description")) {
		return debate
	}

	return {
		...debate,
		...(hasOwn(patch, "name") ? { name: patch.name ?? debate.name } : {}),
		...(hasOwn(patch, "description") ? { description: patch.description ?? debate.description } : {}),
	}
}

function addClaim(debate: Debate, claim: Claim): Debate {
	if (claim.id in debate.claims) {
		throw new Error(`Claim ${claim.id} already exists in the debate.`)
	}

	return {
		...debate,
		claims: {
			...debate.claims,
			[claim.id]: cloneClaim(claim),
		},
	}
}

function applyClaimPatch(debate: Debate, patch: ClaimPatch): Debate {
	const currentClaim = getRequiredClaim(debate, patch.id)

	if (
		!hasOwn(patch, "content")
		&& !hasOwn(patch, "defaultConfidence")
		&& !hasOwn(patch, "defaultRelevance")
	) {
		return debate
	}

	const nextClaim: Claim = {
		...currentClaim,
		...(hasOwn(patch, "content") && patch.content !== undefined ? { content: patch.content } : {}),
	}

	if (hasOwn(patch, "defaultConfidence")) {
		if (patch.defaultConfidence === undefined) {
			delete nextClaim.defaultConfidence
		} else {
			nextClaim.defaultConfidence = patch.defaultConfidence
		}
	}

	if (hasOwn(patch, "defaultRelevance")) {
		if (patch.defaultRelevance === undefined) {
			delete nextClaim.defaultRelevance
		} else {
			nextClaim.defaultRelevance = patch.defaultRelevance
		}
	}

	return {
		...debate,
		claims: {
			...debate.claims,
			[nextClaim.id]: nextClaim,
		},
	}
}

function deleteClaim(debate: Debate, claimId: ClaimId): Debate {
	getRequiredClaim(debate, claimId)

	if (claimId === debate.mainClaimId) {
		throw new Error(`Deleting main claim ${claimId} is not supported.`)
	}

	const nextClaims = { ...debate.claims }
	delete nextClaims[claimId]

	return {
		...debate,
		claims: nextClaims,
	}
}

function addConnector(debate: Debate, connector: Connector): Debate {
	if (connector.id in debate.connectors) {
		throw new Error(`Connector ${connector.id} already exists in the debate.`)
	}

	getRequiredClaim(debate, connector.source)

	if (connector.type === "claim-to-claim") {
		getRequiredClaim(debate, connector.targetClaimId)
	} else {
		getRequiredConnector(debate, connector.targetConnectorId)
	}

	return {
		...debate,
		connectors: {
			...debate.connectors,
			[connector.id]: cloneConnector(connector),
		},
	}
}

function deleteConnector(debate: Debate, connectorId: ConnectorId): Debate {
	getRequiredConnector(debate, connectorId)

	const nextConnectors = { ...debate.connectors }
	delete nextConnectors[connectorId]

	return {
		...debate,
		connectors: nextConnectors,
	}
}

function addScore(debate: Debate, score: Score): Debate {
	if (score.id in debate.scores) {
		throw new Error(`Score ${score.id} already exists in the debate.`)
	}

	getRequiredClaim(debate, score.claimId)

	if (score.connectorId !== undefined) {
		getRequiredConnector(debate, score.connectorId)
	}

	ensureScoreIdsExist(debate.scores, score.incomingScoreIds, `Score ${score.id}`)

	return {
		...debate,
		scores: {
			...debate.scores,
			[score.id]: cloneScore(score),
		},
	}
}

function applyScorePatches(debate: Debate, patches: readonly ScorePatch[]): Debate {
	let nextScores = debate.scores

	for (const patch of patches) {
		if (hasOwn(patch, "scaleOfSources")) {
			throw new Error(`ScoreUpdated patch for ${patch.id} cannot include scaleOfSources.`)
		}

		const currentScore = nextScores[patch.id]
		if (!currentScore) {
			throw new Error(`Score ${patch.id} was not found in the debate.`)
		}

		const nextScore = applyScorePatch(currentScore, patch, debate, nextScores)
		if (nextScore === currentScore) {
			continue
		}

		nextScores = {
			...nextScores,
			[nextScore.id]: nextScore,
		}
	}

	return nextScores === debate.scores
		? debate
		: {
			...debate,
			scores: nextScores,
		}
}

function applyScorePatch(
	score: Score,
	patch: ScorePatch,
	debate: Debate,
	scores: Debate["scores"],
): Score {
	const patchClaimId = hasOwn(patch, "claimId") ? patch.claimId : undefined
	const patchIncomingScoreIds = hasOwn(patch, "incomingScoreIds") ? patch.incomingScoreIds : undefined
	const patchClaimConfidence = hasOwn(patch, "claimConfidence") ? patch.claimConfidence : undefined
	const patchReversibleClaimConfidence = hasOwn(patch, "reversibleClaimConfidence")
		? patch.reversibleClaimConfidence
		: undefined
	const patchConnectorConfidence = hasOwn(patch, "connectorConfidence") ? patch.connectorConfidence : undefined
	const patchReversibleConnectorConfidence = hasOwn(patch, "reversibleConnectorConfidence")
		? patch.reversibleConnectorConfidence
		: undefined
	const patchRelevance = hasOwn(patch, "relevance") ? patch.relevance : undefined
	const patchClaimSide = hasOwn(patch, "claimSide") ? patch.claimSide : undefined
	const patchConnectorSide = hasOwn(patch, "connectorSide") ? patch.connectorSide : undefined

	if (
		patchClaimId === undefined
		&& !hasOwn(patch, "connectorId")
		&& patchIncomingScoreIds === undefined
		&& patchClaimConfidence === undefined
		&& patchReversibleClaimConfidence === undefined
		&& patchConnectorConfidence === undefined
		&& patchReversibleConnectorConfidence === undefined
		&& patchRelevance === undefined
		&& patchClaimSide === undefined
		&& patchConnectorSide === undefined
	) {
		return score
	}

	if (patchClaimId !== undefined) {
		getRequiredClaim(debate, patchClaimId)
	}

	if (hasOwn(patch, "connectorId") && patch.connectorId !== undefined) {
		getRequiredConnector(debate, patch.connectorId)
	}

	if (patchIncomingScoreIds !== undefined) {
		ensureScoreIdsExist(scores, patchIncomingScoreIds, `Score ${patch.id}`)
	}

	const nextScore: Score = {
		...score,
		...(patchClaimId !== undefined ? { claimId: patchClaimId } : {}),
		...(patchIncomingScoreIds !== undefined ? { incomingScoreIds: [...patchIncomingScoreIds] } : {}),
		...(patchClaimConfidence !== undefined ? { claimConfidence: patchClaimConfidence } : {}),
		...(patchReversibleClaimConfidence !== undefined ? { reversibleClaimConfidence: patchReversibleClaimConfidence } : {}),
		...(patchConnectorConfidence !== undefined ? { connectorConfidence: patchConnectorConfidence } : {}),
		...(patchReversibleConnectorConfidence !== undefined ? { reversibleConnectorConfidence: patchReversibleConnectorConfidence } : {}),
		...(patchRelevance !== undefined ? { relevance: patchRelevance } : {}),
		...(patchClaimSide !== undefined ? { claimSide: patchClaimSide } : {}),
		...(patchConnectorSide !== undefined ? { connectorSide: patchConnectorSide } : {}),
	}

	if (hasOwn(patch, "connectorId")) {
		if (patch.connectorId === undefined) {
			delete nextScore.connectorId
		} else {
			nextScore.connectorId = patch.connectorId
		}
	}

	return nextScore
}

function applyScaleOfSourcesPatches(debate: Debate, patches: readonly ScoreScalePatch[]): Debate {
	let nextScores = debate.scores

	for (const patch of patches) {
		const currentScore = nextScores[patch.id]
		if (!currentScore) {
			throw new Error(`Score ${patch.id} was not found in the debate.`)
		}

		if (currentScore.scaleOfSources === patch.scaleOfSources) {
			continue
		}

		nextScores = {
			...nextScores,
			[patch.id]: {
				...currentScore,
				scaleOfSources: patch.scaleOfSources,
			},
		}
	}

	return nextScores === debate.scores
		? debate
		: {
			...debate,
			scores: nextScores,
		}
}

function deleteScore(debate: Debate, scoreId: ScoreId): Debate {
	getRequiredScore(debate, scoreId)

	const nextScores = { ...debate.scores }
	delete nextScores[scoreId]

	return {
		...debate,
		scores: nextScores,
	}
}

function ensureScoreIdsExist(
	scores: Debate["scores"],
	scoreIds: readonly ScoreId[],
	context: string,
): void {
	for (const scoreId of scoreIds) {
		if (!(scoreId in scores)) {
			throw new Error(`${context} references missing incoming score ${scoreId}.`)
		}
	}
}

function getRequiredClaim(debate: Debate, claimId: ClaimId): Claim {
	const claim = debate.claims[claimId]
	if (claim) {
		return claim
	}

	throw new Error(`Claim ${claimId} was not found in the debate.`)
}

function getRequiredConnector(debate: Debate, connectorId: ConnectorId): Connector {
	const connector = debate.connectors[connectorId]
	if (connector) {
		return connector
	}

	throw new Error(`Connector ${connectorId} was not found in the debate.`)
}

function getRequiredScore(debate: Debate, scoreId: ScoreId): Score {
	const score = debate.scores[scoreId]
	if (score) {
		return score
	}

	throw new Error(`Score ${scoreId} was not found in the debate.`)
}

function hasOwn<TObject extends object, TKey extends PropertyKey>(
	value: TObject,
	key: TKey,
): value is TObject & Record<TKey, unknown> {
	return Object.prototype.hasOwnProperty.call(value, key)
}
