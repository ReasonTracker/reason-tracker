import type { AddClaimCommand, EngineCommand, PartialExceptId } from "./01-Commands.ts";
import type { Claim, ClaimId } from "./00-entities/Claim.ts";
import type { ClaimToClaimConnector, ConnectorId, TargetRelation } from "./00-entities/Connector.ts";
import type { Debate } from "./00-entities/Debate.ts";
import type { Side, Score, ScoreId, claimScores, connectorScores } from "./00-entities/Score.ts";
import type { PlannerResult } from "./03-Operations.ts";

const DEFAULT_SCORE_VALUE = 1;
const DEFAULT_SCALE_OF_SOURCES = 0;
const MAX_SCORE_VALUE = 1;
const MIN_REVERSIBLE_SCORE_VALUE = -1;

type CalculatedScoreState = Pick<
    Score,
    | "claimConfidence"
    | "reversibleClaimConfidence"
    | "connectorConfidence"
    | "reversibleConnectorConfidence"
    | "relevance"
    | "scaleOfSources"
>;

interface NormalizedAddClaimCommand {
    command: AddClaimCommand<ClaimId>;
    claim: Claim;
    connector: ClaimToClaimConnector;
    score: Score;
    targetScoreId: ScoreId;
}

interface ScoreIndexes {
    outgoingTargetScoreIdsBySourceScoreId: Partial<Record<ScoreId, ScoreId[]>>;
}

export class Planner {
    plan(commands: readonly EngineCommand[], debate: Debate): readonly PlannerResult[] {
        let workingDebate = debate;

        return commands.map((command) => {
            if (command.type !== "claim/add") {
                throw new Error(`Planner currently supports only claim/add commands. Received ${command.type}.`);
            }

            const translation = translateAddClaimCommand(command, workingDebate);
            workingDebate = translation.debate;
            return translation.result;
        });
    }
}

function translateAddClaimCommand(command: AddClaimCommand, debate: Debate): {
    debate: Debate;
    result: PlannerResult;
} {
    const normalized = normalizeAddClaimCommand(command, debate);
    const augmentedDebate = addClaimToDebate(debate, normalized);
    const recalculation = recalculateDebate(augmentedDebate, normalized.targetScoreId);

    return {
        debate: recalculation.debate,
        result: {
            commands: [normalized.command],
            operations: [
                {
                    type: "AddClaim",
                    claim: normalized.claim,
                },
                {
                    type: "ConnectClaimAnimation",
                    scores: [toConnectorScorePayload(normalized.score)],
                },
                {
                    type: "ClaimScoreUpdate",
                    scores: buildClaimScoreUpdates(augmentedDebate, recalculation.debate, recalculation.processedScoreIds),
                },
                {
                    type: "ConnectorScoreUpdate",
                    scores: buildConnectorScoreUpdates(augmentedDebate, recalculation.debate, recalculation.processedScoreIds),
                },
                {
                    type: "ScaleUpdate",
                    scores: buildScaleUpdates(augmentedDebate, recalculation.debate),
                },
            ],
        },
    };
}

function normalizeAddClaimCommand(command: AddClaimCommand, debate: Debate): NormalizedAddClaimCommand {
    const connectorInput = command.connector;
    if (!connectorInput) {
        throw new Error("AddClaimCommand requires a connector in this planner slice.");
    }

    if (connectorInput.type !== "claim-to-claim" || !connectorInput.targetClaimId) {
        throw new Error("This planner slice supports only claim-to-claim connectors.");
    }

    const claimId = hasId(command.claim)
        ? command.claim.id
        : createUniqueId<ClaimId>((candidate) => candidate in debate.claims);

    const claim: Claim = {
        id: claimId,
        content: command.claim.content ?? "",
        ...(command.claim.defaultConfidence === undefined
            ? {}
            : { defaultConfidence: command.claim.defaultConfidence }),
        ...(command.claim.defaultRelevance === undefined
            ? {}
            : { defaultRelevance: command.claim.defaultRelevance }),
    };

    ensureClaimIdIsAvailable(debate, claim.id);

    const requestedConnectorId = "id" in connectorInput ? connectorInput.id : undefined;
    const connectorId = typeof requestedConnectorId === "string" && !(requestedConnectorId in debate.connectors)
        ? requestedConnectorId
        : createUniqueId<ConnectorId>((candidate) => candidate in debate.connectors);
    const targetScore = getRequiredSingleScoreForClaimId(debate, connectorInput.targetClaimId);

    const connector: ClaimToClaimConnector = {
        id: connectorId,
        type: "claim-to-claim",
        source: claim.id,
        targetClaimId: connectorInput.targetClaimId,
        affects: connectorInput.affects ?? "confidence",
        targetRelationship: connectorInput.targetRelationship,
    };

    const score = createInitialLeafScore(claim, connector, targetScore.claimSide, debate);

    return {
        command: {
            type: "claim/add",
            claim,
            connector,
        },
        claim,
        connector,
        score,
        targetScoreId: targetScore.id,
    };
}

function hasId(claim: AddClaimCommand["claim"]): claim is Claim & { id: ClaimId } {
    return "id" in claim && typeof claim.id === "string" && claim.id.length > 0;
}

function createInitialLeafScore(
    claim: Claim,
    connector: ClaimToClaimConnector,
    targetSide: Side,
    debate: Debate,
): Score {
    const defaultConfidence = claim.defaultConfidence ?? DEFAULT_SCORE_VALUE;
    const claimConfidence = clamp(defaultConfidence, 0, MAX_SCORE_VALUE);
    const reversibleClaimConfidence = clamp(defaultConfidence, MIN_REVERSIBLE_SCORE_VALUE, MAX_SCORE_VALUE);
    const sourceSide = deriveSourceSideFromTargetSide(targetSide, connector.targetRelationship);

    return {
        id: createUniqueId<ScoreId>((candidate) => candidate in debate.scores),
        claimId: claim.id,
        connectorId: connector.id,
        incomingScoreIds: [],
        claimConfidence,
        reversibleClaimConfidence,
        connectorConfidence: claimConfidence,
        reversibleConnectorConfidence: reversibleClaimConfidence,
        relevance: Math.max(0, claim.defaultRelevance ?? DEFAULT_SCORE_VALUE),
        scaleOfSources: DEFAULT_SCALE_OF_SOURCES,
        claimSide: sourceSide,
        connectorSide: sourceSide,
    };
}

function addClaimToDebate(debate: Debate, normalized: NormalizedAddClaimCommand): Debate {
    const targetScore = debate.scores[normalized.targetScoreId];
    if (!targetScore) {
        throw new Error(`Target score ${normalized.targetScoreId} was not found in the debate.`);
    }

    const nextTargetScore: Score = {
        ...targetScore,
        incomingScoreIds: insertIncomingScoreId({
            debate,
            targetScore,
            newSourceScore: normalized.score,
            newTargetRelationship: normalized.connector.targetRelationship,
        }),
    };

    return {
        ...debate,
        claims: {
            ...debate.claims,
            [normalized.claim.id]: normalized.claim,
        },
        connectors: {
            ...debate.connectors,
            [normalized.connector.id]: normalized.connector,
        },
        scores: {
            ...debate.scores,
            [normalized.score.id]: normalized.score,
            [nextTargetScore.id]: nextTargetScore,
        },
    };
}

function recalculateDebate(debate: Debate, startingScoreId: ScoreId): {
    debate: Debate;
    processedScoreIds: readonly ScoreId[];
} {
    let workingDebate = debate;
    const scoreIndexes = createScoreIndexes(debate);
    const pendingScoreIds: ScoreId[] = [startingScoreId];
    const processedScoreIds: ScoreId[] = [];
    const seenScoreIds = new Set<ScoreId>();

    while (pendingScoreIds.length > 0) {
        const scoreId = pendingScoreIds.shift();
        if (!scoreId || seenScoreIds.has(scoreId)) {
            continue;
        }

        seenScoreIds.add(scoreId);
        processedScoreIds.push(scoreId);

        const score = workingDebate.scores[scoreId];
        if (!score) {
            throw new Error(`Score ${scoreId} was not found during recalculation.`);
        }

        workingDebate = updateCalculatedScoreState(workingDebate, scoreId, calculateScoreState(workingDebate, score));
        workingDebate = synchronizeScoreScaleOfSources(workingDebate);

        for (const nextScoreId of getOutgoingTargetScoreIds(scoreIndexes, scoreId)) {
            if (!seenScoreIds.has(nextScoreId)) {
                pendingScoreIds.push(nextScoreId);
            }
        }
    }

    return {
        debate: workingDebate,
        processedScoreIds,
    };
}

function updateCalculatedScoreState(debate: Debate, scoreId: ScoreId, nextState: CalculatedScoreState): Debate {
    const currentScore = debate.scores[scoreId];
    if (!currentScore) {
        throw new Error(`Score ${scoreId} was not found while updating score state.`);
    }

    if (
        currentScore.claimConfidence === nextState.claimConfidence
        && currentScore.reversibleClaimConfidence === nextState.reversibleClaimConfidence
        && currentScore.connectorConfidence === nextState.connectorConfidence
        && currentScore.reversibleConnectorConfidence === nextState.reversibleConnectorConfidence
        && currentScore.relevance === nextState.relevance
        && currentScore.scaleOfSources === nextState.scaleOfSources
    ) {
        return debate;
    }

    return {
        ...debate,
        scores: {
            ...debate.scores,
            [scoreId]: {
                ...currentScore,
                ...nextState,
            },
        },
    };
}

function calculateScoreState(debate: Debate, score: Score): CalculatedScoreState {
    const claim = debate.claims[score.claimId];
    if (!claim) {
        throw new Error(`Claim ${score.claimId} was not found for score ${score.id}.`);
    }

    const incomingChildren = score.incomingScoreIds.map((incomingScoreId) => {
        const incomingScore = debate.scores[incomingScoreId];
        if (!incomingScore) {
            throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
        }

        if (!incomingScore.connectorId) {
            throw new Error(`Incoming score ${incomingScoreId} is missing its connectorId.`);
        }

        const connector = debate.connectors[incomingScore.connectorId];
        if (!connector) {
            throw new Error(`Connector ${incomingScore.connectorId} was not found in the debate.`);
        }

        return {
            connector,
            score: incomingScore,
            targetRelation: connector.targetRelationship,
        };
    });

    if (incomingChildren.length < 1) {
        const defaultConfidence = claim.defaultConfidence ?? DEFAULT_SCORE_VALUE;
        const claimConfidence = clamp(defaultConfidence, 0, MAX_SCORE_VALUE);
        const reversibleClaimConfidence = clamp(defaultConfidence, MIN_REVERSIBLE_SCORE_VALUE, MAX_SCORE_VALUE);

        return {
            claimConfidence,
            reversibleClaimConfidence,
            connectorConfidence: claimConfidence,
            reversibleConnectorConfidence: reversibleClaimConfidence,
            relevance: Math.max(0, claim.defaultRelevance ?? DEFAULT_SCORE_VALUE),
            scaleOfSources: score.scaleOfSources,
        };
    }

    const confidenceChildren = incomingChildren.filter(({ connector }) => connector.affects === "confidence");
    const relevanceChildren = incomingChildren.filter(({ connector }) => connector.affects === "relevance");
    const confidenceResult = calculateConfidence(confidenceChildren);

    return {
        claimConfidence: confidenceResult.claimConfidence,
        reversibleClaimConfidence: confidenceResult.reversibleClaimConfidence,
        connectorConfidence: confidenceResult.claimConfidence,
        reversibleConnectorConfidence: confidenceResult.reversibleClaimConfidence,
        relevance: calculateRelevance(relevanceChildren),
        scaleOfSources: score.scaleOfSources,
    };
}

function calculateConfidence(
    children: Array<{ score: Score; targetRelation: TargetRelation }>,
): Pick<Score, "claimConfidence" | "reversibleClaimConfidence"> {
    if (children.length < 1) {
        return {
            claimConfidence: DEFAULT_SCORE_VALUE,
            reversibleClaimConfidence: DEFAULT_SCORE_VALUE,
        };
    }

    let totalWeight = 0;
    for (const child of children) {
        totalWeight += calculateImpact(child.score);
    }

    let reversibleClaimConfidence = 0;
    if (totalWeight !== 0) {
        for (const child of children) {
            reversibleClaimConfidence +=
                child.score.connectorConfidence
                * (calculateImpact(child.score) / totalWeight)
                * (child.targetRelation === "conTarget" ? -1 : 1);
        }
    }

    return {
        claimConfidence: clamp(reversibleClaimConfidence, 0, MAX_SCORE_VALUE),
        reversibleClaimConfidence: clamp(reversibleClaimConfidence, MIN_REVERSIBLE_SCORE_VALUE, MAX_SCORE_VALUE),
    };
}

function calculateRelevance(children: Array<{ score: Score; targetRelation: TargetRelation }>): number {
    if (children.length < 1) {
        return DEFAULT_SCORE_VALUE;
    }

    let relevance = DEFAULT_SCORE_VALUE;
    for (const child of children) {
        if (child.score.connectorConfidence <= 0) {
            continue;
        }

        if (child.targetRelation === "proTarget") {
            relevance += child.score.connectorConfidence;
            continue;
        }

        relevance -= child.score.connectorConfidence / 2;
    }

    return Math.max(relevance, 0);
}

function buildClaimScoreUpdates(
    before: Debate,
    after: Debate,
    orderedScoreIds: readonly ScoreId[],
): PartialExceptId<claimScores>[] {
    const updates: PartialExceptId<claimScores>[] = [];

    for (const scoreId of orderedScoreIds) {
        const beforeScore = before.scores[scoreId];
        const afterScore = after.scores[scoreId];
        if (!beforeScore || !afterScore) {
            continue;
        }

        if (
            beforeScore.claimConfidence === afterScore.claimConfidence
            && beforeScore.reversibleClaimConfidence === afterScore.reversibleClaimConfidence
            && beforeScore.claimSide === afterScore.claimSide
        ) {
            continue;
        }

        updates.push({
            id: scoreId,
            claimConfidence: afterScore.claimConfidence,
            reversibleClaimConfidence: afterScore.reversibleClaimConfidence,
            claimSide: afterScore.claimSide,
        });
    }

    return updates;
}

function buildConnectorScoreUpdates(
    before: Debate,
    after: Debate,
    orderedScoreIds: readonly ScoreId[],
): PartialExceptId<connectorScores>[] {
    const updates: PartialExceptId<connectorScores>[] = [];

    for (const scoreId of orderedScoreIds) {
        const beforeScore = before.scores[scoreId];
        const afterScore = after.scores[scoreId];
        if (!beforeScore || !afterScore) {
            continue;
        }

        if (
            beforeScore.connectorConfidence === afterScore.connectorConfidence
            && beforeScore.reversibleConnectorConfidence === afterScore.reversibleConnectorConfidence
            && beforeScore.connectorSide === afterScore.connectorSide
        ) {
            continue;
        }

        updates.push({
            id: scoreId,
            connectorConfidence: afterScore.connectorConfidence,
            reversibleConnectorConfidence: afterScore.reversibleConnectorConfidence,
            connectorSide: afterScore.connectorSide,
        });
    }

    return updates;
}

function buildScaleUpdates(
    before: Debate,
    after: Debate,
): PartialExceptId<Pick<Score, "id" | "scaleOfSources">>[] {
    const rootScore = getRequiredSingleScoreForClaimId(after, after.mainClaimId);
    const orderedScoreIds = collectScoreIdsInLayoutOrder(after, rootScore.id);
    const updates: PartialExceptId<Pick<Score, "id" | "scaleOfSources">>[] = [];

    for (const scoreId of orderedScoreIds) {
        const beforeScore = before.scores[scoreId];
        const afterScore = after.scores[scoreId];
        if (!afterScore) {
            continue;
        }

        if (beforeScore?.scaleOfSources === afterScore.scaleOfSources) {
            continue;
        }

        updates.push({
            id: scoreId,
            scaleOfSources: afterScore.scaleOfSources,
        });
    }

    return updates;
}

function toConnectorScorePayload(score: Score): PartialExceptId<connectorScores> {
    return {
        id: score.id,
        connectorConfidence: score.connectorConfidence,
        reversibleConnectorConfidence: score.reversibleConnectorConfidence,
        connectorSide: score.connectorSide,
    };
}

function createScoreIndexes(debate: Debate): ScoreIndexes {
    const outgoingTargetScoreIdsBySourceScoreId: Partial<Record<ScoreId, ScoreId[]>> = {};

    for (const score of Object.values(debate.scores)) {
        for (const incomingScoreId of score.incomingScoreIds) {
            const existing = outgoingTargetScoreIdsBySourceScoreId[incomingScoreId] ?? [];
            outgoingTargetScoreIdsBySourceScoreId[incomingScoreId] = [...existing, score.id];
        }
    }

    return {
        outgoingTargetScoreIdsBySourceScoreId,
    };
}

function getOutgoingTargetScoreIds(indexes: ScoreIndexes, sourceScoreId: ScoreId): ScoreId[] {
    return indexes.outgoingTargetScoreIdsBySourceScoreId[sourceScoreId] ?? [];
}

function getScoresForClaimId(debate: Debate, claimId: ClaimId): Score[] {
    return Object.values(debate.scores).filter((score) => score.claimId === claimId);
}

function getRequiredSingleScoreForClaimId(debate: Debate, claimId: ClaimId): Score {
    const matchingScores = getScoresForClaimId(debate, claimId);
    if (matchingScores.length !== 1) {
        throw new Error(`Expected exactly one score for claim ${claimId}, found ${matchingScores.length}.`);
    }

    return matchingScores[0];
}

function insertIncomingScoreId(args: {
    debate: Debate;
    targetScore: Score;
    newSourceScore: Score;
    newTargetRelationship: TargetRelation;
}): ScoreId[] {
    const nextIncomingScoreIds = [...args.targetScore.incomingScoreIds];
    const newRelation = args.newTargetRelationship;
    const newImpact = calculateImpact(args.newSourceScore);
    let insertAt = nextIncomingScoreIds.length;

    for (let index = 0; index < nextIncomingScoreIds.length; index += 1) {
        const existingSourceScore = args.debate.scores[nextIncomingScoreIds[index]];
        if (!existingSourceScore) {
            throw new Error(`Score ${nextIncomingScoreIds[index]} was not found in the debate.`);
        }

        if (!existingSourceScore.connectorId) {
            throw new Error(`Score ${existingSourceScore.id} is missing its connectorId.`);
        }

        const existingConnector = args.debate.connectors[existingSourceScore.connectorId];
        if (!existingConnector) {
            throw new Error(`Connector ${existingSourceScore.connectorId} was not found in the debate.`);
        }

        const existingRelation = existingConnector.targetRelationship;
        if (!shouldExistingStayBeforeNew(existingRelation, calculateImpact(existingSourceScore), newRelation, newImpact)) {
            insertAt = index;
            break;
        }
    }

    nextIncomingScoreIds.splice(insertAt, 0, args.newSourceScore.id);
    return nextIncomingScoreIds;
}

function shouldExistingStayBeforeNew(
    existingRelation: TargetRelation,
    existingImpact: number,
    newRelation: TargetRelation,
    newImpact: number,
): boolean {
    if (existingRelation !== newRelation) {
        return existingRelation === "proTarget";
    }

    return existingImpact > newImpact;
}

function calculateImpact(score: Score): number {
    return Math.abs(score.connectorConfidence) * score.relevance;
}

function deriveSourceSideFromTargetSide(targetSide: Side, targetRelationship: TargetRelation): Side {
    return targetRelationship === "proTarget" ? targetSide : invertSide(targetSide);
}

function invertSide(side: Side): Side {
    return side === "proMain" ? "conMain" : "proMain";
}

function synchronizeScoreScaleOfSources(debate: Debate): Debate {
    const scaleOfSourcesByScoreId = buildPropagatedScaleOfSourcesByScoreId(debate);
    let hasChanges = false;
    const nextScores = { ...debate.scores };

    for (const [scoreId, score] of Object.entries(debate.scores) as Array<[ScoreId, Score]>) {
        const nextScaleOfSources = scaleOfSourcesByScoreId[scoreId] ?? score.scaleOfSources;
        if (score.scaleOfSources === nextScaleOfSources) {
            continue;
        }

        hasChanges = true;
        nextScores[scoreId] = {
            ...score,
            scaleOfSources: nextScaleOfSources,
        };
    }

    return hasChanges
        ? {
            ...debate,
            scores: nextScores,
        }
        : debate;
}

function buildPropagatedScaleOfSourcesByScoreId(debate: Debate): Record<ScoreId, number> {
    const rootScore = getRequiredSingleScoreForClaimId(debate, debate.mainClaimId);
    const scoreIdsInLayoutOrder = collectScoreIdsInLayoutOrder(debate, rootScore.id);
    const confidenceCascadeScaleByScoreId = {} as Record<ScoreId, number>;
    const scaleOfSourcesByScoreId = {} as Record<ScoreId, number>;
    const incomingScoreIdsByTargetScoreId = {} as Record<ScoreId, Set<ScoreId>>;

    for (const scoreId of scoreIdsInLayoutOrder) {
        confidenceCascadeScaleByScoreId[scoreId] = DEFAULT_SCORE_VALUE;
        scaleOfSourcesByScoreId[scoreId] = scoreId === rootScore.id ? DEFAULT_SCORE_VALUE : DEFAULT_SCALE_OF_SOURCES;
        incomingScoreIdsByTargetScoreId[scoreId] = new Set(debate.scores[scoreId]?.incomingScoreIds ?? []);
    }

    const confidenceGroupScaleByTargetScoreId = {} as Record<ScoreId, number>;
    for (const targetScoreId of scoreIdsInLayoutOrder) {
        const incomingScoreIds = incomingScoreIdsByTargetScoreId[targetScoreId];
        if (!incomingScoreIds || incomingScoreIds.size === 0) {
            continue;
        }

        let totalPositiveConfidenceMass = 0;
        for (const incomingScoreId of incomingScoreIds) {
            const incomingScore = debate.scores[incomingScoreId];
            if (!incomingScore) {
                throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
            }

            if (incomingScore.connectorConfidence > 0) {
                totalPositiveConfidenceMass += incomingScore.connectorConfidence;
            }
        }

        confidenceGroupScaleByTargetScoreId[targetScoreId] = DEFAULT_SCORE_VALUE / Math.max(DEFAULT_SCORE_VALUE, totalPositiveConfidenceMass);
    }

    for (const targetScoreId of scoreIdsInLayoutOrder) {
        const incomingScoreIds = incomingScoreIdsByTargetScoreId[targetScoreId];
        if (!incomingScoreIds || incomingScoreIds.size === 0) {
            continue;
        }

        const targetFinalScale = scaleOfSourcesByScoreId[targetScoreId] ?? DEFAULT_SCORE_VALUE;
        const cascadedConfidenceScaleFromTarget = targetFinalScale * (confidenceGroupScaleByTargetScoreId[targetScoreId] ?? DEFAULT_SCORE_VALUE);

        let maxIncomingRelevance = 0;
        for (const incomingScoreId of incomingScoreIds) {
            const incomingScore = debate.scores[incomingScoreId];
            if (!incomingScore) {
                throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
            }

            maxIncomingRelevance = Math.max(maxIncomingRelevance, Math.max(0, incomingScore.relevance));
        }

        if (maxIncomingRelevance <= 0) {
            maxIncomingRelevance = DEFAULT_SCORE_VALUE;
        }

        for (const incomingScoreId of incomingScoreIds) {
            const incomingScore = debate.scores[incomingScoreId];
            if (!incomingScore) {
                throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
            }

            const nextConfidenceCascadeScale = Math.min(
                confidenceCascadeScaleByScoreId[incomingScoreId] ?? DEFAULT_SCORE_VALUE,
                cascadedConfidenceScaleFromTarget,
            );
            confidenceCascadeScaleByScoreId[incomingScoreId] = nextConfidenceCascadeScale;

            const relevanceNormalizedScale = Math.min(
                DEFAULT_SCORE_VALUE,
                Math.max(0, incomingScore.relevance) / maxIncomingRelevance,
            );
            scaleOfSourcesByScoreId[incomingScoreId] = nextConfidenceCascadeScale * relevanceNormalizedScale;
        }
    }

    return scaleOfSourcesByScoreId;
}

function collectScoreIdsInLayoutOrder(debate: Debate, rootScoreId: ScoreId): ScoreId[] {
    const visited = new Set<ScoreId>();
    const ordered: ScoreId[] = [];

    visitScore(rootScoreId);

    for (const scoreId of Object.keys(debate.scores) as ScoreId[]) {
        visitScore(scoreId);
    }

    return ordered;

    function visitScore(scoreId: ScoreId): void {
        if (visited.has(scoreId)) {
            return;
        }

        const score = debate.scores[scoreId];
        if (!score) {
            throw new Error(`Score ${scoreId} was not found in the debate.`);
        }

        visited.add(scoreId);
        ordered.push(scoreId);

        for (const incomingScoreId of score.incomingScoreIds) {
            visitScore(incomingScoreId);
        }
    }
}

function ensureClaimIdIsAvailable(debate: Debate, claimId: ClaimId): void {
    if (claimId in debate.claims) {
        throw new Error(`Claim ${claimId} already exists in the debate.`);
    }
}

function createUniqueId<TId extends ClaimId | ConnectorId | ScoreId>(isTaken: (candidate: TId) => boolean): TId {
    let candidate = newId() as TId;
    while (isTaken(candidate)) {
        candidate = newId() as TId;
    }

    return candidate;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

const newId = (() => {
    let lastNum: number | undefined;
    let suffixNum = 0;

    return function createId(when: Date = new Date()): string {
        const num = 5000000000000 - when.getTime();
        let result = toBase62(num);

        if (num === lastNum) {
            suffixNum += 1;
        } else {
            suffixNum = Math.floor(Math.random() * ((1073741824 + 536870912) / 2 - 536870912) + 536870912);
        }

        result += toBase62(suffixNum);
        lastNum = num;
        return result;
    };
})();

function toBase62(num: number): string {
    const base62Chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";

    while (num > 0) {
        result = base62Chars[num % 62] + result;
        num = Math.floor(num / 62);
    }

    return result;
}


