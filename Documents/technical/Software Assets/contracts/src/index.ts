declare const __brand: unique symbol;

type Brand<T, TBrand extends string> = T & {
  readonly [__brand]: TBrand;
};

export type DebateId = Brand<string, "DebateId">;
export type ClaimId = Brand<string, "ClaimId">;
export type ConnectorId = Brand<string, "ConnectorId">;
export type ScoreId = Brand<string, "ScoreId">;

export type Polarity = "pro" | "con";
export type ConnectorAffects = "confidence" | "relevance";

export interface Claim {
  id: ClaimId;
  type: "claim";
  content: string;
  pol: Polarity;
  forceConfidence?: number;
}

export interface Connector {
  id: ConnectorId;
  type: "connector";
  source: ClaimId;
  target: ClaimId;
  proTarget: boolean;
  affects: ConnectorAffects;
}

export interface Score {
  id: ScoreId;
  type: "score";
  confidence: number;
  reversibleConfidence: number;
  relevance: number;
}

export interface Debate {
  id: DebateId;
  type: "debate";
  name: string;
  description: string;
  mainClaimId?: ClaimId;
  claims: Record<ClaimId, Claim>;
  connectors: Record<ConnectorId, Connector>;
  scores?: Record<ScoreId, Score>;
}

export interface DebateStepState {
  debate: Debate;
  scores: Record<ScoreId, Score>;
}

export type SetDebateTransaction = {
  kind: "set-debate";
  debate: Debate;
};

export type SetClaimTransaction = {
  kind: "set-claim";
  claim: Claim;
};

export type DeleteClaimTransaction = {
  kind: "delete-claim";
  claimId: ClaimId;
};

export type SetConnectorTransaction = {
  kind: "set-connector";
  connector: Connector;
};

export type DeleteConnectorTransaction = {
  kind: "delete-connector";
  connectorId: ConnectorId;
};

export type SetScoreTransaction = {
  kind: "set-score";
  scoreId: ScoreId;
  score: Score;
};

export type DeleteScoreTransaction = {
  kind: "delete-score";
  scoreId: ScoreId;
};

export type InputTransaction =
  | SetDebateTransaction
  | SetClaimTransaction
  | DeleteClaimTransaction
  | SetConnectorTransaction
  | DeleteConnectorTransaction;

export type EmittedTransaction =
  | InputTransaction
  | SetScoreTransaction
  | DeleteScoreTransaction;
