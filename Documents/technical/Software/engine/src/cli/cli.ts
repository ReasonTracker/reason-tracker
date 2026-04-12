import type {
    CalculateDebateCliRequest,
    CalculatedDebate,
    ClaimId,
    CliResponse,
    Debate,
    Score,
} from "@reasontracker/contracts";
import { isCalculated } from "@reasontracker/contracts";
import { calculateDebate } from "../scoring/calculateDebate.ts";

const MAX_SIMULATION_RUNS = 8;

export function runCli(request: CalculateDebateCliRequest): CliResponse {
    if (request.command !== "calculateDebate") {
        return {
            ok: false,
            command: request.command,
            error: {
                code: "INVALID_REQUEST",
                message: `Unknown command: ${String(request.command)}`,
            },
        };
    }

    const cycleHandling = request.cycleHandling ?? "fail";

    const baseDebate: Debate = isCalculated(request.debate)
        ? (() => {
              const { scores: _scores, ...debateWithoutScores } = request.debate;
              return debateWithoutScores;
          })()
        : request.debate;

    if (cycleHandling === "simulateAllSingleCuts") {
        return runSimulateAllSingleCuts(request.command, baseDebate);
    }

    if (cycleHandling === "cut") {
        return runDeterministicCut(request.command, baseDebate);
    }

    const scoreResult = calculateDebate({
        debate: baseDebate,
        actions: request.actions,
        options: request.options,
    });
    if (!scoreResult.ok) {
        return {
            ok: false,
            command: request.command,
            error: {
                code: "CYCLE_DETECTED",
                message: "Cycle detected and cycleHandling is fail.",
                sccClaimIds: getCycleSccClaimIds(baseDebate),
            },
        };
    }

    return {
        ok: true,
        command: request.command,
        calculatedDebate: {
            ...baseDebate,
            scores: scoreResult.scores,
        },
        diagnostics: scoreResult.diagnostics,
        // Option-dependent fields are present only when requested.
        // The CLI request options are runtime booleans, so this narrow is runtime-based.
        ...(request.options?.includeInitialScores
            ? {
                  initialScores: (scoreResult as { initialScores?: Record<ClaimId, Score> })
                      .initialScores,
              }
            : {}),
        ...(request.options?.includePropagationScoreChanges
            ? {
                  propagationScoreChanges:
                      (
                          scoreResult as {
                              propagationScoreChanges?: {
                                  actionIndex: number;
                                  step: number;
                                  claimId: ClaimId;
                                  before: Score;
                                  after: Score;
                                  delta: {
                                      confidence: number;
                                      reversibleConfidence: number;
                                      relevance: number;
                                  };
                              }[];
                          }
                      ).propagationScoreChanges,
              }
            : {}),
    };
}

function runDeterministicCut(
    command: CalculateDebateCliRequest["command"],
    baseDebate: Debate,
): CliResponse {
    let workingDebate = baseDebate;
    const maxIterations = Object.keys(baseDebate.connectors).length + 1;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const scoreResult = calculateDebate({ debate: workingDebate });
        if (scoreResult.ok) {
            return {
                ok: true,
                command,
                calculatedDebate: {
                    ...workingDebate,
                    scores: scoreResult.scores,
                },
                diagnostics: scoreResult.diagnostics,
            };
        }

        const sccClaimIds = getCycleSccClaimIds(workingDebate);
        const cutCandidate = getCycleConnectorIds(workingDebate, sccClaimIds)[0];
        if (!cutCandidate) {
            return {
                ok: false,
                command,
                error: {
                    code: "CYCLE_DETECTED",
                    message: "Cycle detected and deterministic cut could not resolve it.",
                    sccClaimIds,
                },
            };
        }

        const nextConnectors = { ...workingDebate.connectors };
        delete nextConnectors[cutCandidate as keyof typeof nextConnectors];
        workingDebate = {
            ...workingDebate,
            connectors: nextConnectors,
        };
    }

    return {
        ok: false,
        command,
        error: {
            code: "CYCLE_DETECTED",
            message: "Cycle detected and deterministic cut exceeded iteration limit.",
            sccClaimIds: getCycleSccClaimIds(workingDebate),
        },
    };
}

function runSimulateAllSingleCuts(
    command: CalculateDebateCliRequest["command"],
    baseDebate: Debate,
): CliResponse {
    const sccClaimIds = getCycleSccClaimIds(baseDebate);
    if (sccClaimIds.length < 1) {
        const scoreResult = calculateDebate({ debate: baseDebate });
        if (!scoreResult.ok) {
            return {
                ok: false,
                command,
                error: {
                    code: "CYCLE_DETECTED",
                    message: "Cycle detected during simulation setup.",
                    sccClaimIds: getCycleSccClaimIds(baseDebate),
                },
            };
        }

        return {
            ok: true,
            command,
            calculatedDebate: {
                ...baseDebate,
                scores: scoreResult.scores,
            },
            diagnostics: scoreResult.diagnostics,
            simulations: [],
        };
    }

    const cycleConnectorIds = getCycleConnectorIds(baseDebate, sccClaimIds);
    if (cycleConnectorIds.length > MAX_SIMULATION_RUNS) {
        return {
            ok: false,
            command,
            error: {
                code: "SIMULATION_LIMIT_EXCEEDED",
                message: "Simulation aborted because projected work exceeded limits.",
                sccClaimIds,
                details: {
                    projectedSimulations: cycleConnectorIds.length,
                    maxSimulations: MAX_SIMULATION_RUNS,
                },
            },
        };
    }

    const simulations: CalculatedDebate[] = [];
    for (const connectorId of cycleConnectorIds) {
        const nextConnectors = { ...baseDebate.connectors };
        delete nextConnectors[connectorId as keyof typeof nextConnectors];

        const simulatedDebate: Debate = {
            ...baseDebate,
            connectors: nextConnectors,
        };

        const scoreResult = calculateDebate({ debate: simulatedDebate });
        if (!scoreResult.ok) continue;

        simulations.push({
            ...simulatedDebate,
            scores: scoreResult.scores,
        });
    }

    if (simulations.length < 1) {
        return {
            ok: false,
            command,
            error: {
                code: "CYCLE_DETECTED",
                message: "No valid DAG simulations produced by simulateAllSingleCuts.",
                sccClaimIds,
            },
        };
    }

    return {
        ok: true,
        command,
        calculatedDebate: {
            ...baseDebate,
            scores: averageScores(simulations),
        },
        diagnostics: [],
        simulations,
    };
}

function averageScores(simulations: CalculatedDebate[]): Record<ClaimId, Score> {
    const sums = new Map<string, { confidence: number; reversibleConfidence: number; relevance: number; count: number }>();

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
