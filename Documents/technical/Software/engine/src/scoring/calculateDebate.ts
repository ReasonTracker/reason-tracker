import {
    type CalculateDebateDiagnostic,
    type CalculateDebateOptions,
    type CalculateDebateRequest,
    type CalculateDebateResult,
    type Claim,
    deriveTargetRelation,
    type ClaimId,
    type Connector,
    type Debate,
    type DebateAction,
    type Score,
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

export function calculateDebate<
    O extends CalculateDebateOptions | undefined = undefined,
>(request: CalculateDebateRequest<O>): CalculateDebateResult<O> {
    const diagnostics: CalculateDebateDiagnostic[] = [];
    const includeInitialScores = request.options?.includeInitialScores === true;
    const includePropagationScoreChanges =
        request.options?.includePropagationScoreChanges === true;

    let workingDebate = toDebate(request.debate);
    const initialResult = calculateScores(workingDebate);
    if (!initialResult.ok) {
        return {
            ok: false,
            fatal: true,
            reason: "cycleDetected",
            cycleClaimIds: initialResult.cycleClaimIds,
            diagnostics,
        } as CalculateDebateResult<O>;
    }

    const propagationScoreChanges: ScorePropagationChange[] = [];
    let previousScores = initialResult.scores;

    const actions = request.actions ?? [];
    for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
        const action = actions[actionIndex];
        workingDebate = applyAction(workingDebate, action, actionIndex, diagnostics);

        const actionScoreResult = calculateScores(workingDebate);
        if (!actionScoreResult.ok) {
            return {
                ok: false,
                fatal: true,
                reason: "cycleDetected",
                cycleClaimIds: actionScoreResult.cycleClaimIds,
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

function toDebate(input: Debate | (Debate & { scores?: Record<ClaimId, Score> })): Debate {
    if ("scores" in input) {
        const { scores: _scores, ...debate } = input;
        return debate;
    }

    return input;
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
