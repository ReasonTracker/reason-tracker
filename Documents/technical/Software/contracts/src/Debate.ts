import { newId } from "./newId.ts";
import type { Claim, ClaimId } from "./Claim.ts";
import type { Connector, ConnectorId } from "./Connector.ts";
import type { Score } from "./Score.ts";

export type DebateId = string & { readonly __brand: "DebateId" };

/**
 * A Debate is a group of claims and connectors where:
 * - All claims are connected to at least one other claim (except possibly scratch-pad claims)
 * - There is only one main claim
 */
export interface Debate {

    id: DebateId

    /** A general description of the debate. As markdown. */
    description: string

    /** a short name for the debate. Often similar to the main claim. As markdown. */
    name: string

    /** the id of the main claim the debate is about. */
    mainClaimId: ClaimId

    claims: Record<ClaimId, Claim>
    connectors: Record<ConnectorId, Connector>
}

export type CalculatedDebate = Debate & {
    scores: Record<ClaimId, Score>
};

export type DebateAction =
    | { kind: "claim.upsert"; claim: Claim }
    | {
          kind: "claim.patch";
          claim: Pick<Claim, "id"> & Partial<Omit<Claim, "id">>;
      }
    | { kind: "claim.delete"; claim: Pick<Claim, "id"> }
    | { kind: "connector.upsert"; connector: Connector }
    | {
          kind: "connector.patch";
          connector: Pick<Connector, "id"> & Partial<Omit<Connector, "id">>;
      }
    | { kind: "connector.delete"; connector: Pick<Connector, "id"> };

export type CalculateDebateDiagnostic = {
    severity: "warning" | "recoverableError";
    code:
        | "CLAIM_NOT_FOUND"
        | "CONNECTOR_NOT_FOUND"
        | "PATCH_NO_FIELDS"
        | "PATCH_REFERENCES_UNKNOWN_CLAIM"
        | "CONNECTOR_ENDPOINT_MISSING"
        | "ACTION_CONFLICT"
        | "ACTION_IGNORED";
    message: string;
    actionIndex?: number;
    entityType?: "claim" | "connector";
    entityId?: string;
    details?: Record<string, unknown>;
};

export type ScorePropagationChange = {
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
};

export type CalculateDebateCycleHandling =
    | "fail"
    | "cut"
    | "simulateAllSingleCuts";

export type CalculateDebateOptions = {
    includeInitialScores?: boolean;
    includePropagationScoreChanges?: boolean;
};

export type CalculateDebateRequest<
    O extends CalculateDebateOptions | undefined = undefined,
> = {
    debate: Debate | CalculatedDebate;
    cycleHandling?: CalculateDebateCycleHandling;
    actions?: DebateAction[];
    options?: O;
};

type CalculateDebateSuccessBase = {
    ok: true;
    fatal: false;
    diagnostics: CalculateDebateDiagnostic[];
    scores: Record<ClaimId, Score>;
    simulations?: CalculatedDebate[];
};

type CalculateDebateSuccessExtras<
    O extends CalculateDebateOptions | undefined,
> = (O extends { includeInitialScores: true }
    ? { initialScores: Record<ClaimId, Score> }
    : {}) &
    (O extends { includePropagationScoreChanges: true }
        ? { propagationScoreChanges: ScorePropagationChange[] }
        : {});

export type CalculateDebateFailure = {
    ok: false;
    fatal: true;
    reason: "cycleDetected" | "invalidRequest";
    cycleClaimIds?: ClaimId[];
    sccClaimIds?: string[][];
    message?: string;
    details?: Record<string, unknown>;
    validationErrorCode?: "INVALID_DEBATE" | "SIMULATION_LIMIT_EXCEEDED";
    diagnostics?: CalculateDebateDiagnostic[];
};

export type CalculateDebateResult<
    O extends CalculateDebateOptions | undefined = undefined,
> =
    | (CalculateDebateSuccessBase & CalculateDebateSuccessExtras<O>)
    | CalculateDebateFailure;

export type ProtoDebate = Partial<Debate> & Pick<Debate, 'mainClaimId'>;

/** Populates defaults */
export function newDebate<T extends ProtoDebate>(partialItem: T): T & Debate {
    const newItem = {
        ...partialItem,
        name: partialItem.name ?? "",
        description: partialItem.description ?? "",
        id: partialItem.id ?? (newId() as DebateId),
        claims: partialItem.claims ?? {},
        connectors: partialItem.connectors ?? {},
    } satisfies Debate;
    return newItem as T & Debate
}

export function isCalculated(item: Debate | CalculatedDebate): item is CalculatedDebate {
    return "scores" in item && item.scores !== undefined
}
