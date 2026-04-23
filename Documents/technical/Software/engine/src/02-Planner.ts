import type {
    AddClaimCommand,
    ClaimToScoreConnectionInput,
    CreateConnectorCommand,
    CreateDebateCommand,
    DebateMetadataPatch,
    DeleteClaimCommand,
    DeleteConnectorCommand,
    EngineCommand,
    UpdateClaimCommand,
    UpdateDebateCommand,
} from "./01-Commands.ts";
import type { Claim, ClaimCreate, ClaimId, ClaimPatch } from "./00-entities/Claim.ts";
import type {
    ClaimToClaimConnector,
    ClaimToConnectorConnector,
    Connector,
    ConnectorId,
    TargetRelation,
} from "./00-entities/Connector.ts";
import type { Debate } from "./00-entities/Debate.ts";
import type { Side, Score, ScoreId, ScorePatch } from "./00-entities/Score.ts";
import type { Operation, PlannerResult } from "./03-Operations.ts";

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
    command: AddClaimCommand;
    claim: Claim;
    connector: Connector;
    score: Score;
    targetScoreId: ScoreId;
}

interface NormalizedCreateConnectorCommand {
    command: CreateConnectorCommand;
    connector: Connector;
    score: Score;
    targetScoreId: ScoreId;
}

interface NormalizedCreateDebateCommand {
    command: CreateDebateCommand;
    debate: Debate;
}

interface ClaimRemovalResult {
    debate: Debate;
    removedConnectorIds: ConnectorId[];
    removedScoreIds: ScoreId[];
    recalculationStartScoreIds: ScoreId[];
}

interface ScoreIndexes {
    outgoingTargetScoreIdsBySourceScoreId: Partial<Record<ScoreId, ScoreId[]>>;
}

export class Planner {
    plan(commands: readonly EngineCommand[], debate: Debate): readonly PlannerResult[] {
        let workingDebate = debate;

        return commands.map((command) => {
            switch (command.type) {
                case "debate/create": {
                    const translation = translateCreateDebateCommand(command);
                    workingDebate = translation.debate;
                    return translation.result;
                }
                case "debate/update": {
                    const translation = translateUpdateDebateCommand(command, workingDebate);
                    workingDebate = translation.debate;
                    return translation.result;
                }
                case "claim/add": {
                    const translation = translateAddClaimCommand(command, workingDebate);
                    workingDebate = translation.debate;
                    return translation.result;
                }
                case "claim/update": {
                    const translation = translateUpdateClaimCommand(command, workingDebate);
                    workingDebate = translation.debate;
                    return translation.result;
                }
                case "claim/delete": {
                    const translation = translateDeleteClaimCommand(command, workingDebate);
                    workingDebate = translation.debate;
                    return translation.result;
                }
                case "connector/create": {
                    const translation = translateCreateConnectorCommand(command, workingDebate);
                    workingDebate = translation.debate;
                    return translation.result;
                }
                case "connector/delete": {
                    const translation = translateDeleteConnectorCommand(command, workingDebate);
                    workingDebate = translation.debate;
                    return translation.result;
                }
                default:
                    throw new Error(`Planner received an unsupported command ${(command as EngineCommand).type}.`);
            }
        });
    }
}

function translateCreateDebateCommand(command: CreateDebateCommand): {
    debate: Debate;
    result: PlannerResult;
} {
    const normalized = normalizeCreateDebateCommand(command);

    return {
        debate: normalized.debate,
        result: {
            commands: [normalized.command],
            operations: [
                {
                    type: "DebateCreated",
                    debate: normalized.debate,
                },
            ],
        },
    };
}

function translateUpdateDebateCommand(command: UpdateDebateCommand, debate: Debate): {
    debate: Debate;
    result: PlannerResult;
} {
    const patch = normalizeDebatePatch(command.patch, debate);
    const nextDebate = applyDebatePatch(debate, patch);
    const operations: Operation[] = [];

    if (hasDebatePatchFields(patch)) {
        operations.push({
            type: "DebateUpdated",
            patch,
        });
    }

    return {
        debate: nextDebate,
        result: {
            commands: [{ type: "debate/update", patch }],
            operations,
        },
    };
}

function translateAddClaimCommand(command: AddClaimCommand, debate: Debate): {
    debate: Debate;
    result: PlannerResult;
} {
    const normalized = normalizeAddClaimCommand(command, debate);
    const structurallyUpdatedDebate = addClaimToDebate(debate, normalized);
    const recalculatedDebate = recalculateDebateFromScores(structurallyUpdatedDebate, [normalized.targetScoreId]);
    const scorePatches = buildScorePatches(debate, recalculatedDebate);
    const operations: Operation[] = [
        {
            type: "ClaimAdded",
            claims: [normalized.claim],
        },
        {
            type: "ConnectorAdded",
            connectors: [normalized.connector],
        },
        {
            type: "ScoreAdded",
            scores: [getRequiredScore(recalculatedDebate, normalized.score.id)],
        },
    ];

    if (scorePatches.length > 0) {
        operations.push({
            type: "ScoreUpdated",
            patches: scorePatches,
        });
    }

    return {
        debate: recalculatedDebate,
        result: {
            commands: [normalized.command],
            operations,
        },
    };
}

function translateUpdateClaimCommand(command: UpdateClaimCommand, debate: Debate): {
    debate: Debate;
    result: PlannerResult;
} {
    const patch = normalizeClaimPatch(command.patch, debate);
    const structurallyUpdatedDebate = applyClaimPatch(debate, patch);
    const recalculatedDebate = patchChangesClaimScoring(patch)
        ? recalculateDebateFromScores(
            structurallyUpdatedDebate,
            getScoresForClaimId(structurallyUpdatedDebate, patch.id).map((score) => score.id),
        )
        : structurallyUpdatedDebate;
    const scorePatches = buildScorePatches(debate, recalculatedDebate);
    const operations: Operation[] = [];

    if (hasClaimPatchFields(patch)) {
        operations.push({
            type: "ClaimUpdated",
            patches: [patch],
        });
    }

    if (scorePatches.length > 0) {
        operations.push({
            type: "ScoreUpdated",
            patches: scorePatches,
        });
    }

    return {
        debate: recalculatedDebate,
        result: {
            commands: [{ type: "claim/update", patch }],
            operations,
        },
    };
}

function translateDeleteClaimCommand(command: DeleteClaimCommand, debate: Debate): {
    debate: Debate;
    result: PlannerResult;
} {
    const structural = removeClaimFromDebate(debate, command.claimId);
    const recalculatedDebate = recalculateDebateFromScores(structural.debate, structural.recalculationStartScoreIds);
    const scorePatches = buildScorePatches(debate, recalculatedDebate);
    const operations: Operation[] = [];

    if (structural.removedConnectorIds.length > 0) {
        operations.push({
            type: "ConnectorDeleted",
            connectorIds: structural.removedConnectorIds,
        });
    }

    if (structural.removedScoreIds.length > 0) {
        operations.push({
            type: "ScoreDeleted",
            scoreIds: structural.removedScoreIds,
        });
    }

    operations.push({
        type: "ClaimDeleted",
        claimIds: [command.claimId],
    });

    if (scorePatches.length > 0) {
        operations.push({
            type: "ScoreUpdated",
            patches: scorePatches,
        });
    }

    return {
        debate: recalculatedDebate,
        result: {
            commands: [command],
            operations,
        },
    };
}

function translateCreateConnectorCommand(command: CreateConnectorCommand, debate: Debate): {
    debate: Debate;
    result: PlannerResult;
} {
    const normalized = normalizeCreateConnectorCommand(command, debate);
    const structurallyUpdatedDebate = addConnectionToDebate(debate, normalized);
    const recalculatedDebate = recalculateDebateFromScores(structurallyUpdatedDebate, [normalized.targetScoreId]);
    const scorePatches = buildScorePatches(debate, recalculatedDebate);
    const operations: Operation[] = [
        {
            type: "ConnectorAdded",
            connectors: [normalized.connector],
        },
        {
            type: "ScoreAdded",
            scores: [getRequiredScore(recalculatedDebate, normalized.score.id)],
        },
    ];

    if (scorePatches.length > 0) {
        operations.push({
            type: "ScoreUpdated",
            patches: scorePatches,
        });
    }

    return {
        debate: recalculatedDebate,
        result: {
            commands: [normalized.command],
            operations,
        },
    };
}

function translateDeleteConnectorCommand(command: DeleteConnectorCommand, debate: Debate): {
    debate: Debate;
    result: PlannerResult;
} {
    const structural = removeConnectionFromDebate(debate, command.connectorId);
    const recalculatedDebate = recalculateDebateFromScores(structural.debate, [structural.targetScoreId]);
    const scorePatches = buildScorePatches(debate, recalculatedDebate);
    const operations: Operation[] = [
        {
            type: "ConnectorDeleted",
            connectorIds: [structural.removedConnectorId],
        },
        {
            type: "ScoreDeleted",
            scoreIds: [structural.removedScoreId],
        },
    ];

    if (scorePatches.length > 0) {
        operations.push({
            type: "ScoreUpdated",
            patches: scorePatches,
        });
    }

    return {
        debate: recalculatedDebate,
        result: {
            commands: [command],
            operations,
        },
    };
}

function normalizeCreateDebateCommand(command: CreateDebateCommand): NormalizedCreateDebateCommand {
    const mainClaimId = hasId(command.mainClaim)
        ? command.mainClaim.id
        : createUniqueId<ClaimId>(() => false);
    const mainClaim = createClaim(command.mainClaim, mainClaimId);
    const rootScore = createInitialRootScore(mainClaim, command.mainScoreId);
    const debate: Debate = {
        ...command.debate,
        mainClaimId: mainClaim.id,
        claims: {
            [mainClaim.id]: mainClaim,
        },
        connectors: {},
        scores: {
            [rootScore.id]: rootScore,
        },
    };

    return {
        command: {
            type: "debate/create",
            debate: command.debate,
            mainClaim,
            mainScoreId: rootScore.id,
        },
        debate,
    };
}

function normalizeAddClaimCommand(command: AddClaimCommand, debate: Debate): NormalizedAddClaimCommand {
    const claimId = hasId(command.claim)
        ? command.claim.id
        : createUniqueId<ClaimId>((candidate) => candidate in debate.claims);
    const claim = createClaim(command.claim, claimId);

    ensureClaimIdIsAvailable(debate, claim.id);

    const targetScore = getRequiredScore(debate, command.targetScoreId);
    const connector = createConnectorForTarget({
        commandInput: command.connector,
        sourceClaimId: claim.id,
        targetScore,
        debate,
    });

    const score = createInitialLeafScore({
        claim,
        connector,
        targetScore,
        debate,
        requestedScoreId: command.connector.scoreId,
    });

    return {
        command: {
            type: "claim/add",
            claim,
            targetScoreId: targetScore.id,
            connector: {
                type: command.connector.type,
                id: connector.id,
                scoreId: score.id,
                targetRelationship: connector.targetRelationship,
            },
        },
        claim,
        connector,
        score,
        targetScoreId: targetScore.id,
    };
}

function normalizeCreateConnectorCommand(command: CreateConnectorCommand, debate: Debate): NormalizedCreateConnectorCommand {
    const sourceClaim = getRequiredClaim(debate, command.sourceClaimId);
    const targetScore = getRequiredScore(debate, command.targetScoreId);
    const connector = createConnectorForTarget({
        commandInput: command.connector,
        sourceClaimId: sourceClaim.id,
        targetScore,
        debate,
    });

    const score = createInitialLeafScore({
        claim: sourceClaim,
        connector,
        targetScore,
        debate,
        requestedScoreId: command.connector.scoreId,
    });

    return {
        command: {
            type: "connector/create",
            sourceClaimId: sourceClaim.id,
            targetScoreId: targetScore.id,
            connector: {
                type: command.connector.type,
                id: connector.id,
                scoreId: score.id,
                targetRelationship: connector.targetRelationship,
            },
        },
        connector,
        score,
        targetScoreId: targetScore.id,
    };
}

function normalizeDebatePatch(patch: DebateMetadataPatch, debate: Debate): DebateMetadataPatch {
    if (patch.id !== debate.id) {
        throw new Error(`Debate patch targeted ${patch.id}, but current debate is ${debate.id}.`);
    }

    const normalized: DebateMetadataPatch = { id: debate.id };

    if (hasOwn(patch, "name") && patch.name !== undefined && patch.name !== debate.name) {
        normalized.name = patch.name;
    }

    if (hasOwn(patch, "description") && patch.description !== undefined && patch.description !== debate.description) {
        normalized.description = patch.description;
    }

    return normalized;
}

function normalizeClaimPatch(patch: ClaimPatch, debate: Debate): ClaimPatch {
    const currentClaim = getRequiredClaim(debate, patch.id);
    const normalized: ClaimPatch = { id: currentClaim.id };

    if (hasOwn(patch, "content") && patch.content !== undefined && patch.content !== currentClaim.content) {
        normalized.content = patch.content;
    }

    if (hasOwn(patch, "defaultConfidence") && patch.defaultConfidence !== currentClaim.defaultConfidence) {
        normalized.defaultConfidence = patch.defaultConfidence;
    }

    if (hasOwn(patch, "defaultRelevance") && patch.defaultRelevance !== currentClaim.defaultRelevance) {
        normalized.defaultRelevance = patch.defaultRelevance;
    }

    return normalized;
}

function hasId(claim: ClaimCreate): claim is ClaimCreate & { id: ClaimId } {
    return "id" in claim && typeof claim.id === "string" && claim.id.length > 0;
}

function createClaim(claim: ClaimCreate, claimId: ClaimId): Claim {
    return {
        id: claimId,
        content: claim.content,
        ...(claim.defaultConfidence === undefined ? {} : { defaultConfidence: claim.defaultConfidence }),
        ...(claim.defaultRelevance === undefined ? {} : { defaultRelevance: claim.defaultRelevance }),
    };
}

function createInitialRootScore(claim: Claim, requestedScoreId?: ScoreId): Score {
    const defaultConfidence = claim.defaultConfidence ?? DEFAULT_SCORE_VALUE;
    const claimConfidence = clamp(defaultConfidence, 0, MAX_SCORE_VALUE);
    const reversibleClaimConfidence = clamp(defaultConfidence, MIN_REVERSIBLE_SCORE_VALUE, MAX_SCORE_VALUE);

    return {
        id: resolveRequestedId(
            requestedScoreId,
            () => false,
            () => createUniqueId<ScoreId>(() => false),
            "Score",
        ),
        claimId: claim.id,
        incomingScoreIds: [],
        claimConfidence,
        reversibleClaimConfidence,
        connectorConfidence: claimConfidence,
        reversibleConnectorConfidence: reversibleClaimConfidence,
        relevance: Math.max(0, claim.defaultRelevance ?? DEFAULT_SCORE_VALUE),
        scaleOfSources: DEFAULT_SCORE_VALUE,
        claimSide: "proMain",
        connectorSide: "proMain",
    };
}

function createInitialLeafScore(args: {
    claim: Claim;
    connector: Connector;
    targetScore: Score;
    debate: Debate;
    requestedScoreId?: ScoreId;
}): Score {
    const defaultConfidence = args.claim.defaultConfidence ?? DEFAULT_SCORE_VALUE;
    const claimConfidence = clamp(defaultConfidence, 0, MAX_SCORE_VALUE);
    const reversibleClaimConfidence = clamp(defaultConfidence, MIN_REVERSIBLE_SCORE_VALUE, MAX_SCORE_VALUE);
    const targetSide = getTargetSideForNewSourceScore(args.targetScore, args.connector);
    const sourceSide = deriveSourceSideFromTargetSide(targetSide, args.connector.targetRelationship);

    return {
        id: resolveRequestedId(
            args.requestedScoreId,
            (candidate) => candidate in args.debate.scores,
            () => createUniqueId<ScoreId>((candidate) => candidate in args.debate.scores),
            "Score",
        ),
        claimId: args.claim.id,
        connectorId: args.connector.id,
        incomingScoreIds: [],
        claimConfidence,
        reversibleClaimConfidence,
        connectorConfidence: claimConfidence,
        reversibleConnectorConfidence: reversibleClaimConfidence,
        relevance: Math.max(0, args.claim.defaultRelevance ?? DEFAULT_SCORE_VALUE),
        scaleOfSources: DEFAULT_SCALE_OF_SOURCES,
        claimSide: sourceSide,
        connectorSide: sourceSide,
    };
}

function createConnectorForTarget(args: {
    commandInput: ClaimToScoreConnectionInput;
    sourceClaimId: ClaimId;
    targetScore: Score;
    debate: Debate;
}): Connector {
    const connectorId = resolveRequestedId(
        args.commandInput.id,
        (candidate) => candidate in args.debate.connectors,
        () => createUniqueId<ConnectorId>((candidate) => candidate in args.debate.connectors),
        "Connector",
    );

    if (args.commandInput.type === "claim-to-claim") {
        getRequiredClaim(args.debate, args.targetScore.claimId);

        const connector: ClaimToClaimConnector = {
            id: connectorId,
            type: "claim-to-claim",
            source: args.sourceClaimId,
            targetClaimId: args.targetScore.claimId,
            targetRelationship: args.commandInput.targetRelationship,
        };

        return connector;
    }

    if (!args.targetScore.connectorId) {
        throw new Error(`Score ${args.targetScore.id} cannot be targeted as claim-to-connector because it has no connectorId.`);
    }

    getRequiredConnector(args.debate, args.targetScore.connectorId);

    const connector: ClaimToConnectorConnector = {
        id: connectorId,
        type: "claim-to-connector",
        source: args.sourceClaimId,
        targetConnectorId: args.targetScore.connectorId,
        targetRelationship: args.commandInput.targetRelationship,
    };

    return connector;
}

function addClaimToDebate(debate: Debate, normalized: NormalizedAddClaimCommand): Debate {
    const debateWithConnection = addConnectionToDebate(debate, normalized);

    return {
        ...debateWithConnection,
        claims: {
            ...debateWithConnection.claims,
            [normalized.claim.id]: normalized.claim,
        },
    };
}

function addConnectionToDebate(
    debate: Debate,
    normalized: Pick<NormalizedAddClaimCommand, "connector" | "score" | "targetScoreId"> | NormalizedCreateConnectorCommand,
): Debate {
    const targetScore = getRequiredScore(debate, normalized.targetScoreId);
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

function removeConnectionFromDebate(debate: Debate, connectorId: ConnectorId): {
    debate: Debate;
    targetScoreId: ScoreId;
    removedConnectorId: ConnectorId;
    removedScoreId: ScoreId;
} {
    const score = getScoreByConnectorId(debate, connectorId);
    const targetScore = getTargetScoreForIncomingScoreId(debate, score.id);
    if (!targetScore) {
        throw new Error(`Target score for connector ${connectorId} was not found in the debate.`);
    }

    const nextTargetScore: Score = {
        ...targetScore,
        incomingScoreIds: targetScore.incomingScoreIds.filter((incomingScoreId) => incomingScoreId !== score.id),
    };

    const nextConnectors = { ...debate.connectors };
    delete nextConnectors[connectorId];

    const nextScores = { ...debate.scores };
    delete nextScores[score.id];
    nextScores[nextTargetScore.id] = nextTargetScore;

    return {
        debate: {
            ...debate,
            connectors: nextConnectors,
            scores: nextScores,
        },
        targetScoreId: targetScore.id,
        removedConnectorId: connectorId,
        removedScoreId: score.id,
    };
}

function removeClaimFromDebate(debate: Debate, claimId: ClaimId): ClaimRemovalResult {
    if (claimId === debate.mainClaimId) {
        throw new Error(`Deleting main claim ${claimId} is not supported.`);
    }

    getRequiredClaim(debate, claimId);

    const subtreeScoreIds = collectClaimSubtreeScoreIds(debate, claimId);
    let workingDebate = debate;
    const removedConnectorIds: ConnectorId[] = [];
    const removedScoreIds: ScoreId[] = [];
    const recalculationStartScoreIds: ScoreId[] = [];

    for (const subtreeScoreId of subtreeScoreIds) {
        const score = workingDebate.scores[subtreeScoreId];
        if (!score) {
            continue;
        }

        if (!score.connectorId) {
            throw new Error(`Score ${score.id} is missing a connectorId while deleting claim ${claimId}.`);
        }

        const removal = removeConnectionFromDebate(workingDebate, score.connectorId);
        workingDebate = removal.debate;
        removedConnectorIds.push(removal.removedConnectorId);
        removedScoreIds.push(removal.removedScoreId);

        if (workingDebate.scores[removal.targetScoreId]) {
            recalculationStartScoreIds.push(removal.targetScoreId);
        }
    }

    const nextClaims = { ...workingDebate.claims };
    delete nextClaims[claimId];

    return {
        debate: {
            ...workingDebate,
            claims: nextClaims,
        },
        removedConnectorIds,
        removedScoreIds,
        recalculationStartScoreIds: uniqueExistingScoreIds(
            recalculationStartScoreIds,
            workingDebate,
        ),
    };
}

function recalculateDebateFromScores(debate: Debate, startingScoreIds: readonly ScoreId[]): Debate {
    if (startingScoreIds.length < 1) {
        return synchronizeScoreScaleOfSources(debate);
    }

    let workingDebate = debate;
    const scoreIndexes = createScoreIndexes(debate);
    const pendingScoreIds = [...startingScoreIds];
    const seenScoreIds = new Set<ScoreId>();

    while (pendingScoreIds.length > 0) {
        const scoreId = pendingScoreIds.shift();
        if (!scoreId || seenScoreIds.has(scoreId)) {
            continue;
        }

        seenScoreIds.add(scoreId);

        const score = workingDebate.scores[scoreId];
        if (!score) {
            continue;
        }

        workingDebate = updateCalculatedScoreState(workingDebate, scoreId, calculateScoreState(workingDebate, score));

        for (const nextScoreId of getOutgoingTargetScoreIds(scoreIndexes, scoreId)) {
            if (!seenScoreIds.has(nextScoreId)) {
                pendingScoreIds.push(nextScoreId);
            }
        }
    }

    return synchronizeScoreScaleOfSources(workingDebate);
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

    const confidenceChildren = incomingChildren.filter(({ connector }) => connector.type === "claim-to-claim");
    const relevanceChildren = incomingChildren.filter(({ connector }) => connector.type === "claim-to-connector");
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

function buildScorePatches(before: Debate, after: Debate): ScorePatch[] {
    const scorePatches: ScorePatch[] = [];
    const orderedScoreIds = Object.keys(after.scores).length > 0
        ? collectScoreIdsInLayoutOrder(after, getRequiredMainClaimRootScore(after).id)
        : [];

    for (const scoreId of orderedScoreIds) {
        const beforeScore = before.scores[scoreId];
        const afterScore = after.scores[scoreId];
        if (!beforeScore || !afterScore) {
            continue;
        }

        const patch = buildScorePatch(beforeScore, afterScore);
        if (patch) {
            scorePatches.push(patch);
        }
    }

    return scorePatches;
}

function buildScorePatch(beforeScore: Score, afterScore: Score): ScorePatch | undefined {
    const patch: ScorePatch = { id: afterScore.id };

    if (beforeScore.claimId !== afterScore.claimId) {
        patch.claimId = afterScore.claimId;
    }

    if (beforeScore.connectorId !== afterScore.connectorId) {
        patch.connectorId = afterScore.connectorId;
    }

    if (!arraysEqual(beforeScore.incomingScoreIds, afterScore.incomingScoreIds)) {
        patch.incomingScoreIds = [...afterScore.incomingScoreIds];
    }

    if (beforeScore.claimConfidence !== afterScore.claimConfidence) {
        patch.claimConfidence = afterScore.claimConfidence;
    }

    if (beforeScore.reversibleClaimConfidence !== afterScore.reversibleClaimConfidence) {
        patch.reversibleClaimConfidence = afterScore.reversibleClaimConfidence;
    }

    if (beforeScore.connectorConfidence !== afterScore.connectorConfidence) {
        patch.connectorConfidence = afterScore.connectorConfidence;
    }

    if (beforeScore.reversibleConnectorConfidence !== afterScore.reversibleConnectorConfidence) {
        patch.reversibleConnectorConfidence = afterScore.reversibleConnectorConfidence;
    }

    if (beforeScore.relevance !== afterScore.relevance) {
        patch.relevance = afterScore.relevance;
    }

    if (beforeScore.scaleOfSources !== afterScore.scaleOfSources) {
        patch.scaleOfSources = afterScore.scaleOfSources;
    }

    if (beforeScore.claimSide !== afterScore.claimSide) {
        patch.claimSide = afterScore.claimSide;
    }

    if (beforeScore.connectorSide !== afterScore.connectorSide) {
        patch.connectorSide = afterScore.connectorSide;
    }

    return Object.keys(patch).length > 1 ? patch : undefined;
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

function getRequiredClaim(debate: Debate, claimId: ClaimId): Claim {
    const claim = debate.claims[claimId];
    if (!claim) {
        throw new Error(`Claim ${claimId} was not found in the debate.`);
    }

    return claim;
}

function getRequiredConnector(debate: Debate, connectorId: ConnectorId): Connector {
    const connector = debate.connectors[connectorId];
    if (!connector) {
        throw new Error(`Connector ${connectorId} was not found in the debate.`);
    }

    return connector;
}

function getRequiredScore(debate: Debate, scoreId: ScoreId): Score {
    const score = debate.scores[scoreId];
    if (!score) {
        throw new Error(`Score ${scoreId} was not found in the debate.`);
    }

    return score;
}

function getRequiredMainClaimRootScore(debate: Debate): Score {
    const matchingScores = getScoresForClaimId(debate, debate.mainClaimId);
    if (matchingScores.length !== 1) {
        throw new Error(`Expected exactly one root score for main claim ${debate.mainClaimId}, found ${matchingScores.length}.`);
    }

    return matchingScores[0];
}

function getScoreByConnectorId(debate: Debate, connectorId: ConnectorId): Score {
    const score = Object.values(debate.scores).find((candidate) => candidate.connectorId === connectorId);
    if (!score) {
        throw new Error(`Score for connector ${connectorId} was not found in the debate.`);
    }

    return score;
}

function getTargetScoreForIncomingScoreId(debate: Debate, incomingScoreId: ScoreId): Score | undefined {
    return Object.values(debate.scores).find((candidate) => candidate.incomingScoreIds.includes(incomingScoreId));
}

function collectClaimSubtreeScoreIds(debate: Debate, claimId: ClaimId): ScoreId[] {
    const visited = new Set<ScoreId>();
    const ordered: ScoreId[] = [];

    for (const score of getScoresForClaimId(debate, claimId)) {
        visit(score.id);
    }

    return ordered;

    function visit(scoreId: ScoreId): void {
        if (visited.has(scoreId)) {
            return;
        }

        visited.add(scoreId);

        const score = getRequiredScore(debate, scoreId);
        for (const incomingScoreId of score.incomingScoreIds) {
            visit(incomingScoreId);
        }

        ordered.push(scoreId);
    }
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

function getTargetSideForNewSourceScore(targetScore: Score, connector: Connector): Side {
    return connector.type === "claim-to-connector"
        ? targetScore.connectorSide
        : targetScore.claimSide;
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
    const rootScore = getRequiredMainClaimRootScore(debate);
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

function applyDebatePatch(debate: Debate, patch: DebateMetadataPatch): Debate {
    if (!hasDebatePatchFields(patch)) {
        return debate;
    }

    return {
        ...debate,
        ...(hasOwn(patch, "name") ? { name: patch.name ?? debate.name } : {}),
        ...(hasOwn(patch, "description") ? { description: patch.description ?? debate.description } : {}),
    };
}

function applyClaimPatch(debate: Debate, patch: ClaimPatch): Debate {
    if (!hasClaimPatchFields(patch)) {
        return debate;
    }

    const currentClaim = getRequiredClaim(debate, patch.id);
    const nextClaim: Claim = {
        ...currentClaim,
        ...(hasOwn(patch, "content") && patch.content !== undefined ? { content: patch.content } : {}),
    };

    if (hasOwn(patch, "defaultConfidence")) {
        if (patch.defaultConfidence === undefined) {
            delete nextClaim.defaultConfidence;
        } else {
            nextClaim.defaultConfidence = patch.defaultConfidence;
        }
    }

    if (hasOwn(patch, "defaultRelevance")) {
        if (patch.defaultRelevance === undefined) {
            delete nextClaim.defaultRelevance;
        } else {
            nextClaim.defaultRelevance = patch.defaultRelevance;
        }
    }

    return {
        ...debate,
        claims: {
            ...debate.claims,
            [nextClaim.id]: nextClaim,
        },
    };
}

function patchChangesClaimScoring(patch: ClaimPatch): boolean {
    return hasOwn(patch, "defaultConfidence") || hasOwn(patch, "defaultRelevance");
}

function hasClaimPatchFields(patch: ClaimPatch): boolean {
    return hasOwn(patch, "content") || hasOwn(patch, "defaultConfidence") || hasOwn(patch, "defaultRelevance");
}

function hasDebatePatchFields(patch: DebateMetadataPatch): boolean {
    return hasOwn(patch, "name") || hasOwn(patch, "description");
}

function uniqueExistingScoreIds(scoreIds: readonly ScoreId[], debate: Debate): ScoreId[] {
    const seen = new Set<ScoreId>();
    const result: ScoreId[] = [];

    for (const scoreId of scoreIds) {
        if (seen.has(scoreId) || !(scoreId in debate.scores)) {
            continue;
        }

        seen.add(scoreId);
        result.push(scoreId);
    }

    return result;
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
    if (left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }

    return true;
}

function hasOwn<TKey extends PropertyKey>(value: object, key: TKey): value is Record<TKey, unknown> {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function resolveRequestedId<TId extends ClaimId | ConnectorId | ScoreId>(
    requestedId: TId | undefined,
    isTaken: (candidate: TId) => boolean,
    createFallback: () => TId,
    entityName: string,
): TId {
    if (requestedId === undefined) {
        return createFallback();
    }

    if (isTaken(requestedId)) {
        throw new Error(`${entityName} ${requestedId} already exists in the debate.`);
    }

    return requestedId;
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


