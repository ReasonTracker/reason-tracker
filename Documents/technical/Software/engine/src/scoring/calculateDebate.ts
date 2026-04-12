import {
    type BuildPropagationAnimationRequest,
    type BuildPropagationAnimationResult,
    type CalculateDebateDiagnostic,
    type CalculateDebateOptions,
    type CalculateDebateRequest,
    type CalculateDebateResult,
    type CalculatedDebate,
    type Claim,
    deriveTargetRelation,
    type ClaimId,
    type Connector,
    type Debate,
    type DebateAction,
    type Score,
    type PropagationAnimationKeyState,
    type ScorePropagationChange,
} from "@reasontracker/contracts";
import { calculateConfidence } from "./calculateConfidence.ts";
import { calculateRelevance } from "./calculateRelevance.ts";
import { createConnectorsIndexes } from "./createConnectorsIndexes.ts";
import { sortSourceIdsFirst } from "./sortSourceIdsFirst.ts";

type InternalScoreResult =
    | {
          ok: true;
          scores: Record<ClaimId, Score>;
      }
    | {
          ok: false;
          cycleClaimIds: ClaimId[];
      };

type ValidationFailure = {
    code: "INVALID_DEBATE";
    message: string;
    details?: Record<string, unknown>;
};

const MAX_SIMULATION_RUNS = 8;

type SupportedPropagationCycleHandling = Extract<
    CalculateDebateRequest["cycleHandling"],
    "fail" | "cut"
>;

export function calculateDebate<
    O extends CalculateDebateOptions | undefined = undefined,
>(request: CalculateDebateRequest<O>): CalculateDebateResult<O> {
    const cycleHandling = request.cycleHandling ?? "fail";
    if (cycleHandling === "cut") {
        return runDeterministicCut(request) as CalculateDebateResult<O>;
    }

    if (cycleHandling === "simulateAllSingleCuts") {
        return runSimulateAllSingleCuts(request) as CalculateDebateResult<O>;
    }

    return runFailMode(request) as CalculateDebateResult<O>;
}

export function buildPropagationAnimation(
    request: BuildPropagationAnimationRequest,
): BuildPropagationAnimationResult {
    const diagnostics: CalculateDebateDiagnostic[] = [];

    if (!Number.isFinite(request.fps) || request.fps <= 0) {
        return {
            ok: false,
            reason: "invalidRequest",
            message: "fps must be a positive finite number.",
            diagnostics,
        };
    }

    const cycleHandling: SupportedPropagationCycleHandling =
        request.cycleHandling ?? "fail";

    let workingDebate = toDebate(request.debate);
    const initialScoreResult = calculateDebate({
        debate: workingDebate,
        cycleHandling,
    });

    diagnostics.push(...(initialScoreResult.diagnostics ?? []));

    if (!initialScoreResult.ok) {
        return {
            ok: false,
            reason: initialScoreResult.reason,
            message: initialScoreResult.message ?? "Failed to score initial debate.",
            diagnostics,
        };
    }

    let previousScores = initialScoreResult.scores;
    const keyStates: PropagationAnimationKeyState[] = [];

    const sortedDirectives = [...request.directives].sort((left, right) => {
        if (left.startAtSeconds !== right.startAtSeconds) {
            return left.startAtSeconds - right.startAtSeconds;
        }
        return left.id.localeCompare(right.id);
    });

    for (const directive of sortedDirectives) {
        if (!Number.isFinite(directive.startAtSeconds) || directive.startAtSeconds < 0) {
            return {
                ok: false,
                reason: "invalidRequest",
                message: `Directive ${directive.id} has an invalid startAtSeconds value.`,
                diagnostics,
                directiveId: directive.id,
            };
        }

        if (!Number.isFinite(directive.durationSeconds) || directive.durationSeconds <= 0) {
            return {
                ok: false,
                reason: "invalidRequest",
                message: `Directive ${directive.id} has an invalid durationSeconds value.`,
                diagnostics,
                directiveId: directive.id,
            };
        }

        const actionCount = directive.actions.length;
        if (actionCount < 1) {
            continue;
        }

        const startFrame = Math.round(directive.startAtSeconds * request.fps);
        const durationFrames = Math.max(1, Math.round(directive.durationSeconds * request.fps));

        for (let actionIndex = 0; actionIndex < actionCount; actionIndex += 1) {
            workingDebate = applyAction(
                workingDebate,
                directive.actions[actionIndex],
                actionIndex,
                diagnostics,
            );

            const actionValidationFailure = validateDebate(workingDebate);
            if (actionValidationFailure) {
                return {
                    ok: false,
                    reason: "invalidRequest",
                    message: actionValidationFailure.message,
                    diagnostics,
                    directiveId: directive.id,
                    actionIndex,
                };
            }

            const actionScoreResult = calculateDebate({
                debate: workingDebate,
                cycleHandling,
            });

            diagnostics.push(...(actionScoreResult.diagnostics ?? []));

            if (!actionScoreResult.ok) {
                return {
                    ok: false,
                    reason: actionScoreResult.reason,
                    message:
                        actionScoreResult.message ??
                        `Failed to score directive ${directive.id} action ${String(actionIndex)}.`,
                    diagnostics,
                    directiveId: directive.id,
                    actionIndex,
                };
            }

            const actionEndFrame = actionCount <= 1
                ? startFrame
                : startFrame + Math.round((actionIndex * durationFrames) / (actionCount - 1));

            keyStates.push({
                directiveId: directive.id,
                directiveName: directive.name,
                actionIndex,
                frame: actionEndFrame,
                atSeconds: actionEndFrame / request.fps,
                debate: workingDebate,
                scores: actionScoreResult.scores,
                changes: createPropagationChanges(
                    actionIndex,
                    previousScores,
                    actionScoreResult.scores,
                ),
            });

            previousScores = actionScoreResult.scores;
        }
    }

    return {
        ok: true,
        diagnostics,
        initialScores: initialScoreResult.scores,
        keyStates,
        finalDebate: {
            ...workingDebate,
            scores: previousScores,
        },
    };
}

function runFailMode<O extends CalculateDebateOptions | undefined>(
    request: CalculateDebateRequest<O>,
): CalculateDebateResult<O> {
    const diagnostics: CalculateDebateDiagnostic[] = [];
    const includeInitialScores = request.options?.includeInitialScores === true;
    const includePropagationScoreChanges =
        request.options?.includePropagationScoreChanges === true;

    let workingDebate = toDebate(request.debate);
    const initialValidationFailure = validateDebate(workingDebate);
    if (initialValidationFailure) {
        return {
            ok: false,
            fatal: true,
            reason: "invalidRequest",
            validationErrorCode: initialValidationFailure.code,
            message: initialValidationFailure.message,
            details: initialValidationFailure.details,
            diagnostics,
        } as CalculateDebateResult<O>;
    }

    const initialResult = calculateScores(workingDebate);
    if (!initialResult.ok) {
        const sccClaimIds = getCycleSccClaimIds(workingDebate);
        return {
            ok: false,
            fatal: true,
            reason: "cycleDetected",
            cycleClaimIds: initialResult.cycleClaimIds,
            sccClaimIds,
            diagnostics,
        } as CalculateDebateResult<O>;
    }

    const propagationScoreChanges: ScorePropagationChange[] = [];
    let previousScores = initialResult.scores;

    const actions = request.actions ?? [];
    for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
        const action = actions[actionIndex];
        workingDebate = applyAction(workingDebate, action, actionIndex, diagnostics);

        const actionValidationFailure = validateDebate(workingDebate);
        if (actionValidationFailure) {
            return {
                ok: false,
                fatal: true,
                reason: "invalidRequest",
                validationErrorCode: actionValidationFailure.code,
                message: actionValidationFailure.message,
                details: actionValidationFailure.details,
                diagnostics,
            } as CalculateDebateResult<O>;
        }

        const actionScoreResult = calculateScores(workingDebate);
        if (!actionScoreResult.ok) {
            const sccClaimIds = getCycleSccClaimIds(workingDebate);
            return {
                ok: false,
                fatal: true,
                reason: "cycleDetected",
                cycleClaimIds: actionScoreResult.cycleClaimIds,
                sccClaimIds,
                diagnostics,
            } as CalculateDebateResult<O>;
        }

        if (includePropagationScoreChanges) {
            propagationScoreChanges.push(
                ...createPropagationChanges(
                    actionIndex,
                    previousScores,
                    actionScoreResult.scores,
                ),
            );
        }

        previousScores = actionScoreResult.scores;
    }

    const success = {
        ok: true,
        fatal: false,
        diagnostics,
        scores: previousScores,
        ...(includeInitialScores ? { initialScores: initialResult.scores } : {}),
        ...(includePropagationScoreChanges
            ? { propagationScoreChanges }
            : {}),
    };

    return success as CalculateDebateResult<O>;
}

function runDeterministicCut<O extends CalculateDebateOptions | undefined>(
    request: CalculateDebateRequest<O>,
): CalculateDebateResult<O> {
    const diagnostics: CalculateDebateDiagnostic[] = [];
    let workingDebate = toDebate(request.debate);
    const initialValidationFailure = validateDebate(workingDebate);
    if (initialValidationFailure) {
        return {
            ok: false,
            fatal: true,
            reason: "invalidRequest",
            validationErrorCode: initialValidationFailure.code,
            message: initialValidationFailure.message,
            details: initialValidationFailure.details,
            diagnostics,
        } as CalculateDebateResult<O>;
    }

    const maxIterations = Object.keys(workingDebate.connectors).length + 1;
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const scoreResult = calculateScores(workingDebate);
        if (scoreResult.ok) {
            return {
                ok: true,
                fatal: false,
                diagnostics,
                scores: scoreResult.scores,
            } as CalculateDebateResult<O>;
        }

        const sccClaimIds = getCycleSccClaimIds(workingDebate);
        const cutCandidate = getCycleConnectorIds(workingDebate, sccClaimIds)[0];
        if (!cutCandidate) {
            return {
                ok: false,
                fatal: true,
                reason: "cycleDetected",
                cycleClaimIds: scoreResult.cycleClaimIds,
                sccClaimIds,
                message: "Cycle detected and deterministic cut could not resolve it.",
                diagnostics,
            } as CalculateDebateResult<O>;
        }

        const nextConnectors = { ...workingDebate.connectors };
        delete nextConnectors[cutCandidate as keyof typeof nextConnectors];
        workingDebate = {
            ...workingDebate,
            connectors: nextConnectors,
        };
    }

    const finalSortResult = sortSourceIdsFirst(workingDebate);
    return {
        ok: false,
        fatal: true,
        reason: "cycleDetected",
        cycleClaimIds: finalSortResult.ok
            ? []
            : finalSortResult.cycleClaimIds,
        sccClaimIds: getCycleSccClaimIds(workingDebate),
        message: "Cycle detected and deterministic cut exceeded iteration limit.",
        diagnostics,
    } as CalculateDebateResult<O>;
}

function runSimulateAllSingleCuts<O extends CalculateDebateOptions | undefined>(
    request: CalculateDebateRequest<O>,
): CalculateDebateResult<O> {
    const diagnostics: CalculateDebateDiagnostic[] = [];
    const baseDebate = toDebate(request.debate);
    const initialValidationFailure = validateDebate(baseDebate);
    if (initialValidationFailure) {
        return {
            ok: false,
            fatal: true,
            reason: "invalidRequest",
            validationErrorCode: initialValidationFailure.code,
            message: initialValidationFailure.message,
            details: initialValidationFailure.details,
            diagnostics,
        } as CalculateDebateResult<O>;
    }

    const cycleResult = calculateScores(baseDebate);
    if (cycleResult.ok) {
        return {
            ok: true,
            fatal: false,
            diagnostics,
            scores: cycleResult.scores,
            simulations: [],
        } as CalculateDebateResult<O>;
    }

    const sccClaimIds = getCycleSccClaimIds(baseDebate);
    const cycleConnectorIds = getCycleConnectorIds(baseDebate, sccClaimIds);
    if (cycleConnectorIds.length > MAX_SIMULATION_RUNS) {
        return {
            ok: false,
            fatal: true,
            reason: "invalidRequest",
            validationErrorCode: "SIMULATION_LIMIT_EXCEEDED",
            message: "Simulation aborted because projected work exceeded limits.",
            details: {
                projectedSimulations: cycleConnectorIds.length,
                maxSimulations: MAX_SIMULATION_RUNS,
            },
            cycleClaimIds: cycleResult.cycleClaimIds,
            sccClaimIds,
            diagnostics,
        } as CalculateDebateResult<O>;
    }

    const simulations: CalculatedDebate[] = [];
    for (const connectorId of cycleConnectorIds) {
        const nextConnectors = { ...baseDebate.connectors };
        delete nextConnectors[connectorId as keyof typeof nextConnectors];

        const simulatedDebate: Debate = {
            ...baseDebate,
            connectors: nextConnectors,
        };

        const scoreResult = calculateScores(simulatedDebate);
        if (!scoreResult.ok) continue;

        simulations.push({
            ...simulatedDebate,
            scores: scoreResult.scores,
        });
    }

    if (simulations.length < 1) {
        return {
            ok: false,
            fatal: true,
            reason: "cycleDetected",
            cycleClaimIds: cycleResult.cycleClaimIds,
            sccClaimIds,
            message: "No valid DAG simulations produced by simulateAllSingleCuts.",
            diagnostics,
        } as CalculateDebateResult<O>;
    }

    return {
        ok: true,
        fatal: false,
        diagnostics,
        scores: averageScores(simulations),
        simulations,
    } as CalculateDebateResult<O>;
}

function toDebate(input: Debate | (Debate & { scores?: Record<ClaimId, Score> })): Debate {
    if ("scores" in input) {
        const { scores: _scores, ...debate } = input;
        return debate;
    }

    return input;
}

function validateDebate(debate: Debate): ValidationFailure | undefined {
    if (!debate || typeof debate !== "object") {
        return {
            code: "INVALID_DEBATE",
            message: "Debate must be an object.",
        };
    }

    const claims = debate.claims;
    const connectors = debate.connectors;
    if (!claims || typeof claims !== "object") {
        return {
            code: "INVALID_DEBATE",
            message: "Debate claims must be an object.",
        };
    }

    if (!connectors || typeof connectors !== "object") {
        return {
            code: "INVALID_DEBATE",
            message: "Debate connectors must be an object.",
        };
    }

    if (!debate.mainClaimId || !(debate.mainClaimId in claims)) {
        return {
            code: "INVALID_DEBATE",
            message: "Debate mainClaimId must reference an existing claim.",
            details: {
                mainClaimId: debate.mainClaimId,
            },
        };
    }

    for (const connector of Object.values(connectors)) {
        if (!connector || typeof connector !== "object") {
            return {
                code: "INVALID_DEBATE",
                message: "Every connector must be an object.",
            };
        }

        if (typeof connector.source !== "string" || typeof connector.target !== "string") {
            return {
                code: "INVALID_DEBATE",
                message: "Every connector must include string source and target fields.",
                details: {
                    connectorId: String(connector.id),
                },
            };
        }

        if (!(connector.source in claims) || !(connector.target in claims)) {
            return {
                code: "INVALID_DEBATE",
                message: "Connector endpoints must reference existing claims.",
                details: {
                    connectorId: String(connector.id),
                    source: connector.source,
                    target: connector.target,
                },
            };
        }
    }

    return undefined;
}

function calculateScores(debate: Debate): InternalScoreResult {
    const sortResult = sortSourceIdsFirst(debate);
    if (!sortResult.ok) {
        return {
            ok: false,
            cycleClaimIds: sortResult.cycleClaimIds,
        };
    }

    const scores = {} as Record<ClaimId, Score>;
    const connectorsByTarget = createConnectorsIndexes(debate).byTarget;

    for (const id of sortResult.ids) {
        const claim = debate.claims[id];
        if (!claim) continue;

        const children =
            connectorsByTarget[id]?.map((connector) => {
                const score = scores[connector.source as ClaimId];
                const sourceClaim = debate.claims[connector.source as ClaimId];
                const targetClaim = debate.claims[connector.target as ClaimId];
                const targetRelation = deriveTargetRelation(
                    sourceClaim?.side ?? "proMain",
                    targetClaim?.side ?? "proMain",
                );
                return { score, targetRelation, connector };
            }) ?? [];

        const confidenceChildren = children.filter(
            (child) => child.connector?.affects === "confidence",
        );
        const relevanceChildren = children.filter(
            (child) => child.connector?.affects === "relevance",
        );

        const { confidence, reversibleConfidence } =
            calculateConfidence(confidenceChildren);

        scores[id] = {
            id: id as unknown as Score["id"],
            claimId: id,
            relevance: calculateRelevance(relevanceChildren),
            confidence: claim.forceConfidence ?? confidence,
            reversibleConfidence,
        };
    }

    return {
        ok: true,
        scores,
    };
}

function applyAction(
    debate: Debate,
    action: DebateAction,
    actionIndex: number,
    diagnostics: CalculateDebateDiagnostic[],
): Debate {
    switch (action.kind) {
        case "claim.upsert": {
            const claimId = action.claim.id as ClaimId;
            return {
                ...debate,
                claims: {
                    ...debate.claims,
                    [claimId]: action.claim as Claim,
                },
            };
        }

        case "claim.patch": {
            const claimId = action.claim.id as ClaimId;
            const existingClaim = debate.claims[claimId];

            if (!existingClaim) {
                diagnostics.push({
                    severity: "recoverableError",
                    code: "CLAIM_NOT_FOUND",
                    message: `Claim patch ignored because claim id ${String(claimId)} was not found.`,
                    actionIndex,
                    entityType: "claim",
                    entityId: String(claimId),
                });
                return debate;
            }

            const { id: _id, ...patchFields } = action.claim;
            if (Object.keys(patchFields).length < 1) {
                diagnostics.push({
                    severity: "warning",
                    code: "PATCH_NO_FIELDS",
                    message: `Claim patch ignored because no fields were provided for claim id ${String(claimId)}.`,
                    actionIndex,
                    entityType: "claim",
                    entityId: String(claimId),
                });
                return debate;
            }

            return {
                ...debate,
                claims: {
                    ...debate.claims,
                    [claimId]: {
                        ...existingClaim,
                        ...patchFields,
                        id: claimId,
                    },
                },
            };
        }

        case "claim.delete": {
            const claimId = action.claim.id as ClaimId;
            const existingClaim = debate.claims[claimId];

            if (!existingClaim) {
                diagnostics.push({
                    severity: "recoverableError",
                    code: "CLAIM_NOT_FOUND",
                    message: `Claim delete ignored because claim id ${String(claimId)} was not found.`,
                    actionIndex,
                    entityType: "claim",
                    entityId: String(claimId),
                });
                return debate;
            }

            const nextClaims = { ...debate.claims };
            delete nextClaims[claimId];

            const nextConnectors = { ...debate.connectors };
            let removedConnectors = 0;
            for (const connector of Object.values(debate.connectors)) {
                if (connector.source === claimId || connector.target === claimId) {
                    delete nextConnectors[connector.id as keyof typeof nextConnectors];
                    removedConnectors += 1;
                }
            }

            if (removedConnectors > 0) {
                diagnostics.push({
                    severity: "warning",
                    code: "ACTION_IGNORED",
                    message: `Deleting claim id ${String(claimId)} removed ${String(removedConnectors)} connectors that referenced it.`,
                    actionIndex,
                    entityType: "claim",
                    entityId: String(claimId),
                    details: {
                        removedConnectors,
                    },
                });
            }

            return {
                ...debate,
                claims: nextClaims,
                connectors: nextConnectors,
            };
        }

        case "connector.upsert": {
            const connectorId = String(action.connector.id);
            const sourceExists =
                action.connector.source in debate.claims;
            const targetExists =
                action.connector.target in debate.claims;
            if (!sourceExists || !targetExists) {
                diagnostics.push({
                    severity: "recoverableError",
                    code: "CONNECTOR_ENDPOINT_MISSING",
                    message: `Connector upsert for id ${String(connectorId)} references missing source or target claim.`,
                    actionIndex,
                    entityType: "connector",
                    entityId: String(connectorId),
                    details: {
                        source: action.connector.source,
                        target: action.connector.target,
                    },
                });
            }

            return {
                ...debate,
                connectors: {
                    ...debate.connectors,
                    [action.connector.id]: action.connector as Connector,
                },
            };
        }

        case "connector.patch": {
            const connectorId = action.connector.id as keyof Debate["connectors"];
            const existingConnector = debate.connectors[connectorId];

            if (!existingConnector) {
                diagnostics.push({
                    severity: "recoverableError",
                    code: "CONNECTOR_NOT_FOUND",
                    message: `Connector patch ignored because connector id ${String(action.connector.id)} was not found.`,
                    actionIndex,
                    entityType: "connector",
                    entityId: String(action.connector.id),
                });
                return debate;
            }

            const { id: _id, ...patchFields } = action.connector;
            if (Object.keys(patchFields).length < 1) {
                diagnostics.push({
                    severity: "warning",
                    code: "PATCH_NO_FIELDS",
                    message: `Connector patch ignored because no fields were provided for connector id ${String(action.connector.id)}.`,
                    actionIndex,
                    entityType: "connector",
                    entityId: String(action.connector.id),
                });
                return debate;
            }

            const mergedConnector = {
                ...existingConnector,
                ...patchFields,
                id: existingConnector.id,
            } as Connector;

            const sourceExists = mergedConnector.source in debate.claims;
            const targetExists = mergedConnector.target in debate.claims;
            if (!sourceExists || !targetExists) {
                diagnostics.push({
                    severity: "recoverableError",
                    code: "CONNECTOR_ENDPOINT_MISSING",
                    message: `Connector patch for id ${String(existingConnector.id)} references missing source or target claim.`,
                    actionIndex,
                    entityType: "connector",
                    entityId: String(existingConnector.id),
                    details: {
                        source: mergedConnector.source,
                        target: mergedConnector.target,
                    },
                });
            }

            return {
                ...debate,
                connectors: {
                    ...debate.connectors,
                    [existingConnector.id]: mergedConnector,
                },
            };
        }

        case "connector.delete": {
            const connectorId = action.connector.id as keyof Debate["connectors"];
            const existingConnector = debate.connectors[connectorId];

            if (!existingConnector) {
                diagnostics.push({
                    severity: "recoverableError",
                    code: "CONNECTOR_NOT_FOUND",
                    message: `Connector delete ignored because connector id ${String(action.connector.id)} was not found.`,
                    actionIndex,
                    entityType: "connector",
                    entityId: String(action.connector.id),
                });
                return debate;
            }

            const nextConnectors = { ...debate.connectors };
            delete nextConnectors[connectorId];

            return {
                ...debate,
                connectors: nextConnectors,
            };
        }

        default:
            return debate;
    }
}

function createPropagationChanges(
    actionIndex: number,
    previousScores: Record<ClaimId, Score>,
    nextScores: Record<ClaimId, Score>,
): ScorePropagationChange[] {
    const deltas = Object.keys(nextScores)
        .map((claimId) => {
            const before = previousScores[claimId as ClaimId];
            const after = nextScores[claimId as ClaimId];
            if (!before || !after) return undefined;

            const delta = {
                confidence: after.confidence - before.confidence,
                reversibleConfidence:
                    after.reversibleConfidence - before.reversibleConfidence,
                relevance: after.relevance - before.relevance,
            };

            const magnitude =
                Math.abs(delta.confidence) +
                Math.abs(delta.reversibleConfidence) +
                Math.abs(delta.relevance);

            if (magnitude === 0) return undefined;

            return {
                actionIndex,
                claimId: claimId as ClaimId,
                before,
                after,
                delta,
                magnitude,
            };
        })
        .filter(
            (
                value,
            ): value is {
                actionIndex: number;
                claimId: ClaimId;
                before: Score;
                after: Score;
                delta: {
                    confidence: number;
                    reversibleConfidence: number;
                    relevance: number;
                };
                magnitude: number;
            } => Boolean(value),
        )
        .sort((left, right) => {
            if (right.magnitude !== left.magnitude) {
                return right.magnitude - left.magnitude;
            }
            return String(left.claimId).localeCompare(String(right.claimId));
        });

    return deltas.map((entry, index) => ({
        actionIndex: entry.actionIndex,
        step: index + 1,
        claimId: entry.claimId,
        before: entry.before,
        after: entry.after,
        delta: entry.delta,
    }));
}

function averageScores(simulations: CalculatedDebate[]): Record<ClaimId, Score> {
    const sums = new Map<
        string,
        {
            confidence: number;
            reversibleConfidence: number;
            relevance: number;
            count: number;
        }
    >();

    for (const simulation of simulations) {
        for (const [claimId, score] of Object.entries(simulation.scores)) {
            const sum = sums.get(claimId) ?? {
                confidence: 0,
                reversibleConfidence: 0,
                relevance: 0,
                count: 0,
            };

            sum.confidence += score.confidence;
            sum.reversibleConfidence += score.reversibleConfidence;
            sum.relevance += score.relevance;
            sum.count += 1;
            sums.set(claimId, sum);
        }
    }

    const averaged = {} as Record<ClaimId, Score>;
    const sortedClaimIds = Array.from(sums.keys()).sort();
    for (const claimId of sortedClaimIds) {
        const sum = sums.get(claimId);
        if (!sum || sum.count < 1) continue;

        averaged[claimId as ClaimId] = {
            id: claimId as Score["id"],
            claimId: claimId as ClaimId,
            confidence: sum.confidence / sum.count,
            reversibleConfidence: sum.reversibleConfidence / sum.count,
            relevance: sum.relevance / sum.count,
        };
    }

    return averaged;
}

function getCycleSccClaimIds(debate: Debate): string[][] {
    const adjacency = new Map<string, string[]>();
    const allNodes = new Set<string>(Object.keys(debate.claims));

    for (const connector of Object.values(debate.connectors)) {
        allNodes.add(connector.source);
        allNodes.add(connector.target);
    }

    for (const nodeId of allNodes) {
        adjacency.set(nodeId, []);
    }

    for (const connector of Object.values(debate.connectors)) {
        adjacency.get(connector.source)?.push(connector.target);
    }

    let index = 0;
    const stack: string[] = [];
    const onStack = new Set<string>();
    const indices = new Map<string, number>();
    const lowLink = new Map<string, number>();
    const sccs: string[][] = [];

    function strongConnect(nodeId: string): void {
        indices.set(nodeId, index);
        lowLink.set(nodeId, index);
        index += 1;
        stack.push(nodeId);
        onStack.add(nodeId);

        for (const next of adjacency.get(nodeId) ?? []) {
            if (!indices.has(next)) {
                strongConnect(next);
                lowLink.set(
                    nodeId,
                    Math.min(lowLink.get(nodeId) ?? 0, lowLink.get(next) ?? 0),
                );
            } else if (onStack.has(next)) {
                lowLink.set(
                    nodeId,
                    Math.min(lowLink.get(nodeId) ?? 0, indices.get(next) ?? 0),
                );
            }
        }

        if (lowLink.get(nodeId) !== indices.get(nodeId)) return;

        const component: string[] = [];
        while (stack.length > 0) {
            const popped = stack.pop()!;
            onStack.delete(popped);
            component.push(popped);
            if (popped === nodeId) break;
        }

        const hasSelfLoop = (adjacency.get(component[0]) ?? []).includes(component[0]);
        if (component.length > 1 || hasSelfLoop) {
            component.sort();
            sccs.push(component);
        }
    }

    for (const nodeId of Array.from(allNodes).sort()) {
        if (!indices.has(nodeId)) {
            strongConnect(nodeId);
        }
    }

    sccs.sort((a, b) => a.join("|").localeCompare(b.join("|")));
    return sccs;
}

function getCycleConnectorIds(debate: Debate, sccClaimIds: string[][]): string[] {
    const nodeToGroup = new Map<string, number>();
    for (const [groupIndex, group] of sccClaimIds.entries()) {
        for (const nodeId of group) {
            nodeToGroup.set(nodeId, groupIndex);
        }
    }

    const connectorIds: string[] = [];
    for (const connector of Object.values(debate.connectors)) {
        const sourceGroup = nodeToGroup.get(connector.source);
        const targetGroup = nodeToGroup.get(connector.target);
        if (sourceGroup === undefined || targetGroup === undefined) continue;
        if (sourceGroup !== targetGroup) continue;
        connectorIds.push(String(connector.id));
    }

    connectorIds.sort();
    return connectorIds;
}
