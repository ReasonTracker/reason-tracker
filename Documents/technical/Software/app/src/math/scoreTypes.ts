export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ClaimId = Brand<string, "ClaimId">;
export type ScoreNodeId = Brand<string, "ScoreNodeId">;

/**
 * The reusable statement.
 *
 * A claim can appear in more than one place after cycles are broken.
 */
export type Claim = {
	id: ClaimId;
	text: string;
};

/**
 * One occurrence of a claim in the acyclic scoring tree.
 *
 * The same ClaimId may appear in multiple ScoreNodes.
 */
export type ScoreNode = {
	id: ScoreNodeId;
	claimId: ClaimId;
	parentId?: ScoreNodeId;
	proParent?: boolean;
	affects: "Score" | "Relevance";
	reversible?: boolean;
};

/**
 * The graph consumed by the score calculation.
 *
 * Commands can mutate a richer debate model first, then rebuild this graph.
 */
export type ScoreGraph = {
	nodes: Record<ScoreNodeId, ScoreNode>;
	childrenByParentId?: Partial<Record<ScoreNodeId, ScoreNodeId[]>>;
};

/**
 * The calculated result for one ScoreNode.
 */
export type Score = {
	scoreNodeId: ScoreNodeId;
	claimId: ClaimId;
	value: number;
	rawValue: number;
	weightedSum: number;
	totalWeight: number;
};

export type Scores = Partial<Record<ScoreNodeId, Score>>;

/**
 * One scored child converted into the form used by its parent calculation.
 */
export type Impact = {
	scoreNodeId: ScoreNodeId;
	claimId: ClaimId;
	value: number;
	weight: number;
	relevance: number;
};
