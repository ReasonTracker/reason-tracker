import type {
    AddClaimCommand,
    ClaimConnectionInput,
    ConnectClaimCommand,
    CreateDebateCommand,
    DebateMetadataPatch,
    DeleteClaimCommand,
    DisconnectConnectionCommand,
    EngineCommand,
    ConfidenceConnectionInput,
    RelevanceConnectionInput,
    UpdateClaimCommand,
    UpdateDebateCommand,
} from "./01-Commands.ts";
import type { Claim, ClaimCreate, ClaimId, ClaimPatch } from "./00-entities/Claim.ts";
import type {
    ConfidenceConnector,
    ConfidenceConnectorId,
    Connector,
    ConnectorId,
    RelevanceConnector,
    RelevanceConnectorId,
    TargetRelation,
} from "./00-entities/Connector.ts";
import type { Debate } from "./00-entities/Debate.ts";
import type { Side, Score, ScoreId, ScoreIncomingPatch, ScorePatch, ScoreScalePatch } from "./00-entities/Score.ts";
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
>;

interface NormalizedAddClaimCommand {
    command: AddClaimCommand;
    claim: Claim;
    connector: Connector;
    score: Score;
    targetScoreId: ScoreId;
}

interface NormalizedConnectClaimCommand {
    command: ConnectClaimCommand;
    connector: Connector;
    score: Score;
    targetScoreId: ScoreId;
}

interface NormalizedCreateDebateCommand {
    command: CreateDebateCommand;
    debate: Debate;
}

interface RemovedScoreOccurrence {
    connectorId: ConnectorId;
    scoreId: ScoreId;
}

interface StructuralRemovalResult {
    debate: Debate;
    removedOccurrences: RemovedScoreOccurrence[];
    recalculationStartScoreIds: ScoreId[];
}

interface ScorePropagationResult {
    debate: Debate;
    operations: Operation[];
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
                case "confidence/connect":
                case "relevance/connect": {
                    const translation = translateConnectClaimCommand(command, workingDebate);
                    workingDebate = translation.debate;
                    return translation.result;
                }
                case "confidence/disconnect":
                case "relevance/disconnect": {
                    const translation = translateDisconnectConnectionCommand(command, workingDebate);
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
    const propagation = propagateScoreUpdates(debate, structurallyUpdatedDebate, [normalized.targetScoreId]);
    const operations: Operation[] = [
        {
            type: "ClaimAdded",
            claim: normalized.claim,
        },
        {
            type: "ConnectorAdded",
            connector: normalized.connector,
        },
        {
            type: "ScoreAdded",
            score: normalized.score,
        },
    ];

    operations.push(...propagation.operations);

    return {
        debate: propagation.debate,
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
    const recalculationStartScoreIds = patchChangesClaimScoring(patch)
        ? getScoresForClaimId(structurallyUpdatedDebate, patch.id).map((score) => score.id)
        : [];
    const propagation = propagateScoreUpdates(debate, structurallyUpdatedDebate, recalculationStartScoreIds);
    const operations: Operation[] = [];

    if (hasClaimPatchFields(patch)) {
        operations.push({
            type: "ClaimUpdated",
            patch,
        });
    }

    operations.push(...propagation.operations);

    return {
        debate: propagation.debate,
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
    const propagation = propagateScoreUpdates(debate, structural.debate, structural.recalculationStartScoreIds);
    const operations: Operation[] = [];

    for (const occurrence of structural.removedOccurrences) {
        operations.push({
            type: "ScoreDeleted",
            scoreId: occurrence.scoreId,
        });
        operations.push({
            type: "ConnectorDeleted",
            connectorId: occurrence.connectorId,
        });
    }

    operations.push({
        type: "ClaimDeleted",
        claimId: command.claimId,
    });

    operations.push(...propagation.operations);

    return {
        debate: propagation.debate,
        result: {
            commands: [command],
            operations,
        },
    };
}

function translateConnectClaimCommand(command: ConnectClaimCommand, debate: Debate): {
    debate: Debate;
    result: PlannerResult;
} {
    const normalized = normalizeConnectClaimCommand(command, debate);
    const structurallyUpdatedDebate = addConnectionToDebate(debate, normalized);
    const propagation = propagateScoreUpdates(debate, structurallyUpdatedDebate, [normalized.targetScoreId]);
    const operations: Operation[] = [
        {
            type: "ConnectorAdded",
            connector: normalized.connector,
        },
        {
            type: "ScoreAdded",
            score: normalized.score,
        },
    ];

    operations.push(...propagation.operations);

    return {
        debate: propagation.debate,
        result: {
            commands: [normalized.command],
            operations,
        },
    };
}

function translateDisconnectConnectionCommand(command: DisconnectConnectionCommand, debate: Debate): {
    debate: Debate;
    result: PlannerResult;
} {
    const structural = removeConnectionFromDebate(debate, getConnectorIdFromDisconnectCommand(command));
    const propagation = propagateScoreUpdates(debate, structural.debate, structural.recalculationStartScoreIds);
    const operations: Operation[] = [];

    for (const occurrence of structural.removedOccurrences) {
        operations.push({
            type: "ScoreDeleted",
            scoreId: occurrence.scoreId,
        });
        operations.push({
            type: "ConnectorDeleted",
            connectorId: occurrence.connectorId,
        });
    }

    operations.push(...propagation.operations);

    return {
        debate: propagation.debate,
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
    if (!command.connection) {
        throw new Error(`AddClaimCommand.connection is required. Use the semantic command payload field 'connection', not 'connector'.`);
    }

    const claimId = hasId(command.claim)
        ? command.claim.id
        : createUniqueId<ClaimId>((candidate) => candidate in debate.claims);
    const claim = createClaim(command.claim, claimId);

    ensureClaimIdIsAvailable(debate, claim.id);

    const targetScore = getRequiredScore(debate, command.targetScoreId);
    const connector = createConnectorForTarget({
        commandInput: command.connection,
        sourceClaimId: claim.id,
        targetScore,
        debate,
    });

    const score = createInitialLeafScore({
        claim,
        connector,
        targetScore,
        debate,
        requestedScoreId: command.connection.scoreId,
    });

    return {
        command: {
            type: "claim/add",
            claim,
            targetScoreId: targetScore.id,
            connection: createNormalizedConnectionInput(connector, score.id),
        },
        claim,
        connector,
        score,
        targetScoreId: targetScore.id,
    };
}

function normalizeConnectClaimCommand(command: ConnectClaimCommand, debate: Debate): NormalizedConnectClaimCommand {
    if (!command.connection) {
        throw new Error(`Connect claim commands require a 'connection' payload. Use 'connection', not 'connector'.`);
    }

    const sourceClaim = getRequiredClaim(debate, command.sourceClaimId);
    const targetScore = getRequiredScore(debate, command.targetScoreId);
    const connector = createConnectorForTarget({
        commandInput: command.connection,
        sourceClaimId: sourceClaim.id,
        targetScore,
        debate,
    });

    const score = createInitialLeafScore({
        claim: sourceClaim,
        connector,
        targetScore,
        debate,
        requestedScoreId: command.connection.scoreId,
    });

    if (command.type === "confidence/connect") {
        if (connector.type !== "confidence") {
            throw new Error(`Confidence connect command resolved non-confidence connector ${connector.id}.`);
        }

        return {
            command: {
                type: "confidence/connect",
                sourceClaimId: sourceClaim.id,
                targetScoreId: targetScore.id,
                connection: createNormalizedConfidenceConnectionInput(connector, score.id),
            },
            connector,
            score,
            targetScoreId: targetScore.id,
        };
    }

    if (connector.type !== "relevance") {
        throw new Error(`Relevance connect command resolved non-relevance connector ${connector.id}.`);
    }

    return {
        command: {
            type: "relevance/connect",
            sourceClaimId: sourceClaim.id,
            targetScoreId: targetScore.id,
            connection: createNormalizedRelevanceConnectionInput(connector, score.id),
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
        deliveryScaleOfSources: DEFAULT_SCORE_VALUE,
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
    const relevance = Math.max(0, args.claim.defaultRelevance ?? DEFAULT_SCORE_VALUE);
    const scaleOfSources = calculateInitialLeafScaleOfSources(args);
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
        relevance,
        scaleOfSources,
        deliveryScaleOfSources: args.connector.type === "confidence"
            ? scaleOfSources * relevance
            : scaleOfSources,
        claimSide: sourceSide,
        connectorSide: sourceSide,
    };
}

function calculateInitialLeafScaleOfSources(args: {
    connector: Connector;
    targetScore: Score;
    debate: Debate;
}): number {
    if (args.connector.type === "relevance") {
        return args.targetScore.scaleOfSources;
    }

    let confidenceChildCount = 1;
    for (const incomingScoreId of args.targetScore.incomingScoreIds) {
        const incomingScore = getRequiredScore(args.debate, incomingScoreId);
        if (!incomingScore.connectorId) {
            throw new Error(`Incoming score ${incomingScoreId} did not have a connector while calculating initial source scale.`);
        }

        const connector = getRequiredConnector(args.debate, incomingScore.connectorId);
        if (connector.type === "confidence") {
            confidenceChildCount += 1;
        }
    }

    return args.targetScore.scaleOfSources
        * (DEFAULT_SCORE_VALUE / Math.max(DEFAULT_SCORE_VALUE, confidenceChildCount));
}

function createConnectorForTarget(args: {
    commandInput: ClaimConnectionInput;
    sourceClaimId: ClaimId;
    targetScore: Score;
    debate: Debate;
}): Connector {
    if (args.commandInput.type === "confidence") {
        const connectorId = resolveRequestedId(
            args.commandInput.id,
            (candidate) => candidate in args.debate.connectors,
            () => createUniqueId<ConfidenceConnectorId>((candidate) => candidate in args.debate.connectors),
            "Connector",
        );

        getRequiredClaim(args.debate, args.targetScore.claimId);

        const connector: ConfidenceConnector = {
            id: connectorId,
            type: "confidence",
            source: args.sourceClaimId,
            targetClaimId: args.targetScore.claimId,
            targetRelationship: args.commandInput.targetRelationship,
        };

        return connector;
    }

    if (!args.targetScore.connectorId) {
        throw new Error(`Score ${args.targetScore.id} cannot be targeted for relevance because it has no connectorId.`);
    }

    const connectorId = resolveRequestedId(
        args.commandInput.id,
        (candidate) => candidate in args.debate.connectors,
        () => createUniqueId<RelevanceConnectorId>((candidate) => candidate in args.debate.connectors),
        "Connector",
    );
    const targetConnector = getRequiredConnector(args.debate, args.targetScore.connectorId);

    if (targetConnector.type !== "confidence") {
        throw new Error(
            `Score ${args.targetScore.id} cannot be targeted for relevance because connector ${targetConnector.id} is ${targetConnector.type}.`,
        );
    }

    const connector: RelevanceConnector = {
        id: connectorId,
        type: "relevance",
        source: args.sourceClaimId,
        targetConfidenceConnectorId: targetConnector.id,
        targetRelationship: args.commandInput.targetRelationship,
    };

    return connector;
}

function createNormalizedConnectionInput(connector: Connector, scoreId: ScoreId): ClaimConnectionInput {
    if (connector.type === "confidence") {
        return createNormalizedConfidenceConnectionInput(connector, scoreId);
    }

    return createNormalizedRelevanceConnectionInput(connector, scoreId);
}

function createNormalizedConfidenceConnectionInput(
    connector: ConfidenceConnector,
    scoreId: ScoreId,
): ConfidenceConnectionInput {
    return {
        type: "confidence",
        id: connector.id,
        scoreId,
        targetRelationship: connector.targetRelationship,
    };
}

function createNormalizedRelevanceConnectionInput(
    connector: RelevanceConnector,
    scoreId: ScoreId,
): RelevanceConnectionInput {
    return {
        type: "relevance",
        id: connector.id,
        scoreId,
        targetRelationship: connector.targetRelationship,
    };
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
    normalized: Pick<NormalizedAddClaimCommand, "connector" | "score" | "targetScoreId"> | NormalizedConnectClaimCommand,
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

function removeConnectionFromDebate(debate: Debate, connectorId: ConnectorId): StructuralRemovalResult {
    const score = getScoreByConnectorId(debate, connectorId);
    return removeScoreOccurrencesFromDebate(debate, [score.id]);
}

function getConnectorIdFromDisconnectCommand(command: DisconnectConnectionCommand): ConnectorId {
    return command.type === "confidence/disconnect"
        ? command.confidenceConnectorId
        : command.relevanceConnectorId;
}

function removeClaimFromDebate(debate: Debate, claimId: ClaimId): StructuralRemovalResult {
    if (claimId === debate.mainClaimId) {
        throw new Error(`Deleting main claim ${claimId} is not supported.`);
    }

    getRequiredClaim(debate, claimId);

    const removal = removeScoreOccurrencesFromDebate(
        debate,
        getScoresForClaimId(debate, claimId).map((score) => score.id),
    );
    const nextClaims = { ...removal.debate.claims };
    delete nextClaims[claimId];
    const nextDebate: Debate = {
        ...removal.debate,
        claims: nextClaims,
    };

    return {
        debate: nextDebate,
        removedOccurrences: removal.removedOccurrences,
        recalculationStartScoreIds: uniqueExistingScoreIds(
            removal.recalculationStartScoreIds,
            nextDebate,
        ),
    };
}

function removeScoreOccurrencesFromDebate(
    debate: Debate,
    rootScoreIds: readonly ScoreId[],
): StructuralRemovalResult {
    const removedScoreIds = collectRemovableScoreOccurrenceIds(debate, rootScoreIds);
    const removedScoreIdSet = new Set(removedScoreIds);
    const removedConnectorIdSet = new Set<ConnectorId>();
    const removedOccurrences: RemovedScoreOccurrence[] = [];
    const recalculationStartScoreIds: ScoreId[] = [];

    for (const scoreId of removedScoreIds) {
        const score = getRequiredScore(debate, scoreId);
        if (!score.connectorId) {
            throw new Error(`Score ${score.id} is missing a connectorId while being removed from the debate.`);
        }

        removedConnectorIdSet.add(score.connectorId);
        removedOccurrences.push({
            connectorId: score.connectorId,
            scoreId: score.id,
        });

        const targetScore = getTargetScoreForIncomingScoreId(debate, score.id);
        if (targetScore && !removedScoreIdSet.has(targetScore.id)) {
            recalculationStartScoreIds.push(targetScore.id);
        }
    }

    const nextConnectors = {} as Debate["connectors"];
    for (const connector of Object.values(debate.connectors)) {
        if (!removedConnectorIdSet.has(connector.id)) {
            nextConnectors[connector.id] = connector;
        }
    }

    const nextScores = {} as Debate["scores"];
    for (const score of Object.values(debate.scores)) {
        if (removedScoreIdSet.has(score.id)) {
            continue;
        }

        const nextIncomingScoreIds = score.incomingScoreIds.filter(
            (incomingScoreId) => !removedScoreIdSet.has(incomingScoreId),
        );
        nextScores[score.id] = nextIncomingScoreIds.length === score.incomingScoreIds.length
            ? score
            : {
                ...score,
                incomingScoreIds: nextIncomingScoreIds,
            };
    }

    const nextDebate: Debate = {
        ...debate,
        connectors: nextConnectors,
        scores: nextScores,
    };

    return {
        debate: nextDebate,
        removedOccurrences,
        recalculationStartScoreIds: uniqueExistingScoreIds(
            recalculationStartScoreIds,
            nextDebate,
        ),
    };
}

function propagateScoreUpdates(
    patchBaseline: Debate,
    structurallyUpdatedDebate: Debate,
    startingScoreIds: readonly ScoreId[],
): ScorePropagationResult {
    const incomingChangePropagation = propagateIncomingScoreChanges(
        patchBaseline,
        structurallyUpdatedDebate,
    );
    const calculatedPropagation = propagateCalculatedScoreUpdates(
        patchBaseline,
        incomingChangePropagation.debate,
        startingScoreIds,
    );
    const incomingSortPropagation = propagateIncomingScoreSorting(calculatedPropagation.debate);
    const scalePropagation = propagateScoreScaleOfSources(incomingSortPropagation.debate);

    return {
        debate: scalePropagation.debate,
        operations: [
            ...incomingChangePropagation.operations,
            ...calculatedPropagation.operations,
            ...incomingSortPropagation.operations,
            ...scalePropagation.operations,
        ],
    };
}

function propagateIncomingScoreChanges(
    previousDebate: Debate,
    structurallyUpdatedDebate: Debate,
): ScorePropagationResult {
    const patches = collectScoreIncomingPatches(previousDebate, structurallyUpdatedDebate);

    return {
        debate: structurallyUpdatedDebate,
        operations: patches.length > 0
            ? [
                {
                    type: "incomingScoresChanged",
                    patches,
                },
            ]
            : [],
    };
}

function propagateCalculatedScoreUpdates(
    previousDebate: Debate,
    structurallyUpdatedDebate: Debate,
    startingScoreIds: readonly ScoreId[],
): ScorePropagationResult {
    let workingDebate = structurallyUpdatedDebate;
    const operations: Operation[] = [];
    let stepBaselineDebate = previousDebate;

    for (const currentStepScoreIds of collectUpwardScorePropagationSteps(structurallyUpdatedDebate, startingScoreIds)) {
        const patches: ScorePatch[] = [];
        let nextScores = workingDebate.scores;

        for (const scoreId of currentStepScoreIds) {
            const currentScore = nextScores[scoreId];
            if (!currentScore) {
                continue;
            }

            const beforeScore = stepBaselineDebate.scores[scoreId] ?? workingDebate.scores[scoreId];
            if (!beforeScore) {
                continue;
            }

            const nextScore = applyCalculatedScoreStateToScore(
                currentScore,
                calculateScoreState(
                    {
                        ...workingDebate,
                        scores: nextScores,
                    },
                    currentScore,
                ),
            );
            nextScores = nextScore === currentScore
                ? nextScores
                : {
                    ...nextScores,
                    [scoreId]: nextScore,
                };
            const patch = buildScorePatch(beforeScore, nextScore);

            if (patch) {
                patches.push(patch);
            }
        }

        workingDebate = nextScores === workingDebate.scores
            ? workingDebate
            : {
                ...workingDebate,
                scores: nextScores,
            };

        if (patches.length > 0) {
            operations.push({
                type: "ScoreUpdated",
                patches,
            });
        }

        stepBaselineDebate = workingDebate;
    }

    return {
        debate: workingDebate,
        operations,
    };
}

function propagateIncomingScoreSorting(debate: Debate): ScorePropagationResult {
    const rootScore = getRequiredMainClaimRootScore(debate);
    const orderedScoreIds = collectScoreIdsInLayoutOrder(debate, rootScore.id);
    let nextScores = debate.scores;
    const patches: ScoreIncomingPatch[] = [];

    for (const scoreId of orderedScoreIds) {
        const currentScore = nextScores[scoreId];
        if (!currentScore || currentScore.incomingScoreIds.length < 2) {
            continue;
        }

        const nextIncomingScoreIds = sortIncomingScoreIds(
            {
                ...debate,
                scores: nextScores,
            },
            currentScore,
        );
        if (arraysEqual(currentScore.incomingScoreIds, nextIncomingScoreIds)) {
            continue;
        }

        const nextScore: Score = {
            ...currentScore,
            incomingScoreIds: nextIncomingScoreIds,
        };
        nextScores = {
            ...nextScores,
            [scoreId]: nextScore,
        };

        const patch = buildScoreIncomingPatch(currentScore, nextScore);
        if (patch) {
            patches.push(patch);
        }
    }

    return {
        debate: nextScores === debate.scores
            ? debate
            : {
                ...debate,
                scores: nextScores,
            },
        operations: patches.length > 0
            ? [
                {
                    type: "incomingScoresSorted",
                    patches,
                },
            ]
            : [],
    };
}

function collectUpwardScorePropagationSteps(debate: Debate, startingScoreIds: readonly ScoreId[]): ScoreId[][] {
    const scoreIndexes = createScoreIndexes(debate);
    const startingStep = uniqueExistingScoreIds(startingScoreIds, debate);
    const stepIndexByScoreId = new Map<ScoreId, number>();

    for (const scoreId of startingStep) {
        stepIndexByScoreId.set(scoreId, 0);
    }

    const pendingScoreIds = [...startingStep];
    while (pendingScoreIds.length > 0) {
        const scoreId = pendingScoreIds.shift();
        if (!scoreId) {
            continue;
        }

        const currentStepIndex = stepIndexByScoreId.get(scoreId);
        if (currentStepIndex === undefined) {
            continue;
        }

        for (const nextScoreId of getOutgoingTargetScoreIds(scoreIndexes, scoreId)) {
            const nextStepIndex = currentStepIndex + 1;
            const existingStepIndex = stepIndexByScoreId.get(nextScoreId);
            if (existingStepIndex !== undefined && existingStepIndex >= nextStepIndex) {
                continue;
            }

            stepIndexByScoreId.set(nextScoreId, nextStepIndex);
            pendingScoreIds.push(nextScoreId);
        }
    }

    const steps: ScoreId[][] = [];
    for (const [scoreId, stepIndex] of stepIndexByScoreId.entries()) {
        const existingStep = steps[stepIndex];
        if (existingStep) {
            existingStep.push(scoreId);
            continue;
        }

        steps[stepIndex] = [scoreId];
    }

    return steps
        .filter((step): step is ScoreId[] => Array.isArray(step) && step.length > 0)
        .map((step) => uniqueExistingScoreIds(step, debate));
}

function applyCalculatedScoreStateToScore(score: Score, nextState: CalculatedScoreState): Score {
    if (
        score.claimConfidence === nextState.claimConfidence
        && score.reversibleClaimConfidence === nextState.reversibleClaimConfidence
        && score.connectorConfidence === nextState.connectorConfidence
        && score.reversibleConnectorConfidence === nextState.reversibleConnectorConfidence
        && score.relevance === nextState.relevance
    ) {
        return score;
    }

    return {
        ...score,
        ...nextState,
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
        };
    }

    const confidenceChildren = incomingChildren.filter(({ connector }) => connector.type === "confidence");
    const relevanceChildren = incomingChildren.filter(({ connector }) => connector.type === "relevance");
    const confidenceResult = calculateConfidence(confidenceChildren);

    return {
        claimConfidence: confidenceResult.claimConfidence,
        reversibleClaimConfidence: confidenceResult.reversibleClaimConfidence,
        connectorConfidence: confidenceResult.claimConfidence,
        reversibleConnectorConfidence: confidenceResult.reversibleClaimConfidence,
        relevance: calculateRelevance(relevanceChildren),
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

function buildScorePatch(beforeScore: Score, afterScore: Score): ScorePatch | undefined {
    const patch: ScorePatch = { id: afterScore.id };

    if (beforeScore.claimId !== afterScore.claimId) {
        patch.claimId = afterScore.claimId;
    }

    if (beforeScore.connectorId !== afterScore.connectorId) {
        patch.connectorId = afterScore.connectorId;
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

    if (beforeScore.claimSide !== afterScore.claimSide) {
        patch.claimSide = afterScore.claimSide;
    }

    if (beforeScore.connectorSide !== afterScore.connectorSide) {
        patch.connectorSide = afterScore.connectorSide;
    }

    return Object.keys(patch).length > 1 ? patch : undefined;
}

function buildScoreIncomingPatch(beforeScore: Score, afterScore: Score): ScoreIncomingPatch | undefined {
    if (arraysEqual(beforeScore.incomingScoreIds, afterScore.incomingScoreIds)) {
        return undefined;
    }

    return {
        id: afterScore.id,
        incomingScoreIds: [...afterScore.incomingScoreIds],
    };
}

function buildScoreScalePatch(beforeScore: Score, afterScore: Score): ScoreScalePatch | undefined {
    if (
        beforeScore.scaleOfSources === afterScore.scaleOfSources
        && beforeScore.deliveryScaleOfSources === afterScore.deliveryScaleOfSources
    ) {
        return undefined;
    }

    return {
        id: afterScore.id,
        scaleOfSources: afterScore.scaleOfSources,
        deliveryScaleOfSources: afterScore.deliveryScaleOfSources,
    };
}

function collectScoreIncomingPatches(beforeDebate: Debate, afterDebate: Debate): ScoreIncomingPatch[] {
    const rootScore = getRequiredMainClaimRootScore(afterDebate);
    const patches: ScoreIncomingPatch[] = [];

    for (const scoreId of collectScoreIdsInLayoutOrder(afterDebate, rootScore.id)) {
        const beforeScore = beforeDebate.scores[scoreId];
        const afterScore = afterDebate.scores[scoreId];
        if (!beforeScore || !afterScore) {
            continue;
        }

        const patch = buildScoreIncomingPatch(beforeScore, afterScore);
        if (patch) {
            patches.push(patch);
        }
    }

    return patches;
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

function collectRemovableScoreOccurrenceIds(debate: Debate, rootScoreIds: readonly ScoreId[]): ScoreId[] {
    const visited = new Set<ScoreId>();
    const ordered: ScoreId[] = [];

    for (const rootScoreId of rootScoreIds) {
        if (!(rootScoreId in debate.scores)) {
            continue;
        }

        visit(rootScoreId);
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

        if (score.connectorId) {
            const connector = getRequiredConnector(debate, score.connectorId);
            if (connector.type === "confidence") {
                for (const attachedScoreId of getScoreIdsByTargetConfidenceConnectorId(debate, connector.id)) {
                    visit(attachedScoreId);
                }
            }
        }

        ordered.push(scoreId);
    }
}

function getScoreIdsByTargetConfidenceConnectorId(
    debate: Debate,
    targetConfidenceConnectorId: ConfidenceConnectorId,
): ScoreId[] {
    const scoreIds: ScoreId[] = [];

    for (const score of Object.values(debate.scores)) {
        if (!score.connectorId) {
            continue;
        }

        const connector = debate.connectors[score.connectorId];
        if (
            connector
            && connector.type === "relevance"
            && connector.targetConfidenceConnectorId === targetConfidenceConnectorId
        ) {
            scoreIds.push(score.id);
        }
    }

    return scoreIds;
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

function sortIncomingScoreIds(debate: Debate, targetScore: Score): ScoreId[] {
    return targetScore.incomingScoreIds
        .map((incomingScoreId, originalIndex) => {
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
                scoreId: incomingScoreId,
                targetRelationship: connector.targetRelationship,
                impact: calculateImpact(incomingScore),
                originalIndex,
            };
        })
        .sort((left, right) => {
            if (left.targetRelationship !== right.targetRelationship) {
                return left.targetRelationship === "proTarget" ? -1 : 1;
            }

            if (left.impact !== right.impact) {
                return right.impact - left.impact;
            }

            return left.originalIndex - right.originalIndex;
        })
        .map(({ scoreId }) => scoreId);
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
    return connector.type === "relevance"
        ? targetScore.connectorSide
        : targetScore.claimSide;
}

function deriveSourceSideFromTargetSide(targetSide: Side, targetRelationship: TargetRelation): Side {
    return targetRelationship === "proTarget" ? targetSide : invertSide(targetSide);
}

function invertSide(side: Side): Side {
    return side === "proMain" ? "conMain" : "proMain";
}

function propagateScoreScaleOfSources(debate: Debate): ScorePropagationResult {
    const rootScore = getRequiredMainClaimRootScore(debate);
    const confidenceGroupScaleByTargetScoreId = buildConfidenceGroupScaleByTargetScoreId(debate);
    const scaleOfSourcesByScoreId = {} as Record<ScoreId, number>;
    const deliveryScaleOfSourcesByScoreId = {} as Record<ScoreId, number>;
    let workingDebate = debate;
    const allPatches: ScoreScalePatch[] = [];
    let pendingTargetScoreIds: ScoreId[] = [rootScore.id];
    const traversedTargetScoreIds = new Set<ScoreId>();

    for (const scoreId of Object.keys(debate.scores) as ScoreId[]) {
        scaleOfSourcesByScoreId[scoreId] = scoreId === rootScore.id
            ? DEFAULT_SCORE_VALUE
            : DEFAULT_SCALE_OF_SOURCES;
        deliveryScaleOfSourcesByScoreId[scoreId] = scaleOfSourcesByScoreId[scoreId];
    }

    const rootPatch = applyScaleOfSourcesWave([rootScore.id]);
    if (rootPatch.patches.length > 0) {
        workingDebate = rootPatch.debate;
        allPatches.push(...rootPatch.patches);
    }

    while (pendingTargetScoreIds.length > 0) {
        const currentTargetScoreIds = uniqueExistingScoreIds(pendingTargetScoreIds, workingDebate)
            .filter((scoreId) => !traversedTargetScoreIds.has(scoreId));
        pendingTargetScoreIds = [];

        if (currentTargetScoreIds.length < 1) {
            continue;
        }

        const nextSourceScoreIds: ScoreId[] = [];

        for (const targetScoreId of currentTargetScoreIds) {
            traversedTargetScoreIds.add(targetScoreId);

            const targetScore = workingDebate.scores[targetScoreId];
            if (!targetScore || targetScore.incomingScoreIds.length < 1) {
                continue;
            }

            const targetSourceScale = scaleOfSourcesByScoreId[targetScoreId] ?? DEFAULT_SCORE_VALUE;
            const confidenceSourceScaleFromTarget =
                targetSourceScale * (confidenceGroupScaleByTargetScoreId[targetScoreId] ?? DEFAULT_SCORE_VALUE);

            for (const incomingScoreId of targetScore.incomingScoreIds) {
                const incomingScore = workingDebate.scores[incomingScoreId];
                if (!incomingScore) {
                    throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
                }

                if (!incomingScore.connectorId) {
                    throw new Error(`Incoming score ${incomingScoreId} did not have a connector while propagating scale.`);
                }

                const connector = getRequiredConnector(workingDebate, incomingScore.connectorId);
                const nextScaleOfSources = connector.type === "confidence"
                    ? confidenceSourceScaleFromTarget
                    : targetSourceScale;
                scaleOfSourcesByScoreId[incomingScoreId] = nextScaleOfSources;
                deliveryScaleOfSourcesByScoreId[incomingScoreId] = connector.type === "confidence"
                    ? nextScaleOfSources * getDeliveryRelevanceMultiplier(incomingScore)
                    : nextScaleOfSources;
                nextSourceScoreIds.push(incomingScoreId);
            }
        }

        const scaleWave = applyScaleOfSourcesWave(nextSourceScoreIds);
        workingDebate = scaleWave.debate;

        if (scaleWave.patches.length > 0) {
            allPatches.push(...scaleWave.patches);
        }

        pendingTargetScoreIds = nextSourceScoreIds;
    }

    return {
        debate: workingDebate,
        operations: allPatches.length > 0
            ? [
                {
                    type: "scaleOfSources",
                    patches: allPatches,
                },
            ]
            : [],
    };

    function applyScaleOfSourcesWave(scoreIds: readonly ScoreId[]): {
        debate: Debate;
        patches: ScoreScalePatch[];
    } {
        const patches: ScoreScalePatch[] = [];
        let nextScores = workingDebate.scores;

        for (const scoreId of uniqueExistingScoreIds(scoreIds, workingDebate)) {
            const score = nextScores[scoreId];
            if (!score) {
                continue;
            }

            const nextScaleOfSources = scaleOfSourcesByScoreId[scoreId] ?? score.scaleOfSources;
            const nextDeliveryScaleOfSources =
                deliveryScaleOfSourcesByScoreId[scoreId] ?? score.deliveryScaleOfSources;
            if (
                score.scaleOfSources === nextScaleOfSources
                && score.deliveryScaleOfSources === nextDeliveryScaleOfSources
            ) {
                continue;
            }

            const nextScore: Score = {
                ...score,
                scaleOfSources: nextScaleOfSources,
                deliveryScaleOfSources: nextDeliveryScaleOfSources,
            };
            nextScores = {
                ...nextScores,
                [scoreId]: nextScore,
            };

            const patch = buildScoreScalePatch(score, nextScore);
            if (patch) {
                patches.push(patch);
            }
        }

        return {
            debate: nextScores === workingDebate.scores
                ? workingDebate
                : {
                    ...workingDebate,
                    scores: nextScores,
                },
            patches,
        };
    }
}

function buildConfidenceGroupScaleByTargetScoreId(debate: Debate): Record<ScoreId, number> {
    const confidenceGroupScaleByTargetScoreId = {} as Record<ScoreId, number>;

    for (const targetScore of Object.values(debate.scores)) {
        if (targetScore.incomingScoreIds.length < 1) {
            continue;
        }

        let confidenceChildCount = 0;
        for (const incomingScoreId of targetScore.incomingScoreIds) {
            const incomingScore = debate.scores[incomingScoreId];
            if (!incomingScore) {
                throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
            }

            if (!incomingScore.connectorId) {
                throw new Error(`Incoming score ${incomingScoreId} did not have a connector while calculating group scale.`);
            }

            const connector = getRequiredConnector(debate, incomingScore.connectorId);
            if (connector.type !== "confidence") {
                continue;
            }

            confidenceChildCount += 1;
        }

        confidenceGroupScaleByTargetScoreId[targetScore.id] =
            DEFAULT_SCORE_VALUE / Math.max(DEFAULT_SCORE_VALUE, confidenceChildCount);
    }

    return confidenceGroupScaleByTargetScoreId;
}

function getDeliveryRelevanceMultiplier(score: Score): number {
    return Math.max(0, score.relevance);
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
