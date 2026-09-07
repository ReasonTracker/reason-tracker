import type { DebateCore } from "../debate-core/Debate.ts";
import type {
	PresentationClaimOccurrence,
	PresentationClaimOccurrenceId,
	PresentationConfidenceConnectorOccurrence,
	PresentationConnectorOccurrenceId,
	PresentationRelevanceConnectorOccurrence,
} from "./buildPresentationGraphFromDebateCore.ts";
import type {
	ConfidenceConnectionFrameState,
	DebateFrame,
	RelevanceConnectionFrameState,
} from "./DebateAnimationPlan.ts";
import type { PlannerOptions } from "./contracts.ts";
import type { ResolvedPresentationMath } from "./resolvePresentationMath.ts";

type ClaimLaneMember = {
	claimOccurrenceId: PresentationClaimOccurrenceId
	connectorOccurrenceId: PresentationConnectorOccurrenceId
	targetRelationship: "proTarget" | "conTarget"
};

export function buildDebateFrame(args: {
	debateCore: DebateCore
	options: PlannerOptions
	resolvedMath: ResolvedPresentationMath
	visualScales?: Partial<Record<PresentationClaimOccurrenceId, number>>
}): DebateFrame {
	const frame: DebateFrame = {
		claims: {},
		confidenceConnections: {},
		relevanceConnections: {},
	};
	const measuredHeights = new Map<PresentationClaimOccurrenceId, number>();

	const measureClaim = (claimOccurrenceId: PresentationClaimOccurrenceId): number => {
		const cached = measuredHeights.get(claimOccurrenceId);
		if (cached !== undefined) {
			return cached;
		}

		const claimOccurrence = getClaimOccurrence(args.resolvedMath, claimOccurrenceId);
		const scale = resolveVisualScale(args, claimOccurrenceId);
		const members = getClaimLaneMembers(args.resolvedMath, claimOccurrence);
		const membersHeight = members.reduce((height, member, index) => {
			const memberHeight = measureClaim(member.claimOccurrenceId);
			if (index === 0) {
				return memberHeight;
			}

			const previousMember = members[index - 1];
			const previousScale = resolveVisualScale(args, previousMember.claimOccurrenceId);
			const memberScale = resolveVisualScale(args, member.claimOccurrenceId);

			return height
				+ (args.options.claimLaneAxisGap * ((previousScale + memberScale) / 2))
				+ memberHeight;
		}, 0);
		const height = Math.max(args.options.claimHeight * scale, membersHeight);
		measuredHeights.set(claimOccurrenceId, height);
		return height;
	};

	const layoutClaim = (
		claimOccurrenceId: PresentationClaimOccurrenceId,
		claimLeftEdgeX: number,
		claimCenterY: number,
	): void => {
		const occurrence = getClaimOccurrence(args.resolvedMath, claimOccurrenceId);
		const sourcesScale = resolveVisualScale(args, claimOccurrenceId);
		const score = args.resolvedMath.claimScores[claimOccurrenceId];
		const side = args.resolvedMath.sides[claimOccurrenceId];
		if (!score || !side) {
			throw new Error(`Missing resolved presentation values for ${claimOccurrenceId}`);
		}

		frame.claims[claimOccurrenceId] = {
			claimId: occurrence.claimId,
			id: claimOccurrenceId,
			opacity: 1,
			position: {
				x: claimLeftEdgeX + ((args.options.claimWidth * sourcesScale) / 2),
				y: claimCenterY,
			},
			scale: sourcesScale,
			score: score.value,
			side,
			sourcesScale,
		};

		const members = getClaimLaneMembers(args.resolvedMath, occurrence);
		if (members.length === 0) {
			return;
		}

		const usesJunctionLane = occurrence.confidenceConnectorOccurrenceIds.some(
			(connectorOccurrenceId) => {
				const connector = args.resolvedMath.presentationGraph.connectorOccurrences[
					connectorOccurrenceId
				];
				return connector?.type === "confidence"
					&& connector.relevanceConnectorOccurrenceIds.length > 0;
			},
		);
		const corridorWidth = (
			args.options.connectorCurveLaneWidth
			+ args.options.connectorDiagonalLaneWidth
			+ args.options.connectorCurveLaneWidth
			+ (usesJunctionLane ? args.options.junctionLaneWidth : 0)
		) * sourcesScale;
		const sourceLaneLeftEdgeX = claimLeftEdgeX
			+ (args.options.claimWidth * sourcesScale)
			+ corridorWidth;
		const membersHeight = members.reduce((height, member, index) => {
			const memberHeight = measureClaim(member.claimOccurrenceId);
			if (index === 0) {
				return memberHeight;
			}

			const previousMember = members[index - 1];
			const previousScale = getRequiredNumber(
				args.resolvedMath.sourcesScales[previousMember.claimOccurrenceId],
				`source scale for ${previousMember.claimOccurrenceId}`,
			);
			const memberScale = getRequiredNumber(
				args.resolvedMath.sourcesScales[member.claimOccurrenceId],
				`source scale for ${member.claimOccurrenceId}`,
			);

			return height
				+ (args.options.claimLaneAxisGap * ((previousScale + memberScale) / 2))
				+ memberHeight;
		}, 0);
		let memberTop = claimCenterY - (membersHeight / 2);

		members.forEach((member, index) => {
			const memberHeight = measureClaim(member.claimOccurrenceId);
			layoutClaim(
				member.claimOccurrenceId,
				sourceLaneLeftEdgeX,
				memberTop + (memberHeight / 2),
			);
			memberTop += memberHeight;
			const nextMember = members[index + 1];
			if (nextMember) {
				const memberScale = resolveVisualScale(args, member.claimOccurrenceId);
				const nextScale = resolveVisualScale(args, nextMember.claimOccurrenceId);
				memberTop += args.options.claimLaneAxisGap * ((memberScale + nextScale) / 2);
			}
		});
	};

	measureClaim(args.resolvedMath.presentationGraph.rootClaimOccurrenceId);
	layoutClaim(
		args.resolvedMath.presentationGraph.rootClaimOccurrenceId,
		0,
		0,
	);
	buildConnectionStates({ frame, options: args.options, resolvedMath: args.resolvedMath });

	return frame;
}

function buildConnectionStates(args: {
	frame: DebateFrame
	options: PlannerOptions
	resolvedMath: ResolvedPresentationMath
}): void {
	for (const claimOccurrence of Object.values(args.resolvedMath.presentationGraph.claimOccurrences)) {
		const confidenceOccurrences = claimOccurrence.confidenceConnectorOccurrenceIds.map(
			(connectorOccurrenceId) => getConfidenceOccurrence(args.resolvedMath, connectorOccurrenceId),
		);
		const confidenceOffsets = resolveCenteredOffsets(
			confidenceOccurrences.map((occurrence) => resolveConnectionEnvelope({
				options: args.options,
				scale: getRequiredNumber(
					args.resolvedMath.deliveryScales[occurrence.sourceClaimOccurrenceId],
					`delivery scale for ${occurrence.sourceClaimOccurrenceId}`,
				),
			})),
		);

		confidenceOccurrences.forEach((occurrence, index) => {
			const sourceScale = getRequiredNumber(
				args.resolvedMath.sourcesScales[occurrence.sourceClaimOccurrenceId],
				`source scale for ${occurrence.sourceClaimOccurrenceId}`,
			);
			const deliveryScale = getRequiredNumber(
				args.resolvedMath.deliveryScales[occurrence.sourceClaimOccurrenceId],
				`delivery scale for ${occurrence.sourceClaimOccurrenceId}`,
			);
			const score = args.resolvedMath.claimScores[occurrence.sourceClaimOccurrenceId];
			const side = args.resolvedMath.sides[occurrence.sourceClaimOccurrenceId];
			if (!score || !side) {
				throw new Error(`Missing resolved connection values for ${occurrence.id}`);
			}

			const state: ConfidenceConnectionFrameState = {
				confidenceConnectorId: occurrence.confidenceConnectorId,
				deliveryScale,
				id: occurrence.id,
				relevanceConnectorOccurrenceIds: occurrence.relevanceConnectorOccurrenceIds,
				score: score.value,
				shellReveal: 1,
				side,
				sourceClaimOccurrenceId: occurrence.sourceClaimOccurrenceId,
				sourceScale,
				targetClaimOccurrenceId: occurrence.targetClaimOccurrenceId,
				targetSideOffset: confidenceOffsets[index] ?? 0,
				volumeTransitions: [],
			};
			args.frame.confidenceConnections[occurrence.id] = state;

			const relevanceOccurrences = occurrence.relevanceConnectorOccurrenceIds.map(
				(connectorOccurrenceId) => getRelevanceOccurrence(
					args.resolvedMath,
					connectorOccurrenceId,
				),
			);
			const relevanceOffsets = resolveCenteredOffsets(
				relevanceOccurrences.map((relevanceOccurrence) => resolveConnectionEnvelope({
					options: args.options,
					scale: getRequiredNumber(
						args.resolvedMath.sourcesScales[relevanceOccurrence.sourceClaimOccurrenceId],
						`source scale for ${relevanceOccurrence.sourceClaimOccurrenceId}`,
					),
				})),
			);

			relevanceOccurrences.forEach((relevanceOccurrence, relevanceIndex) => {
				const relevanceScale = getRequiredNumber(
					args.resolvedMath.sourcesScales[relevanceOccurrence.sourceClaimOccurrenceId],
					`source scale for ${relevanceOccurrence.sourceClaimOccurrenceId}`,
				);
				const relevanceScore = args.resolvedMath.claimScores[
					relevanceOccurrence.sourceClaimOccurrenceId
				];
				const relevanceSide = args.resolvedMath.sides[
					relevanceOccurrence.sourceClaimOccurrenceId
				];
				if (!relevanceScore || !relevanceSide) {
					throw new Error(`Missing resolved relevance values for ${relevanceOccurrence.id}`);
				}

				const relevanceState: RelevanceConnectionFrameState = {
					id: relevanceOccurrence.id,
					relevanceConnectorId: relevanceOccurrence.relevanceConnectorId,
					scale: relevanceScale,
					score: relevanceScore.value,
					shellReveal: 1,
					side: relevanceSide,
					sourceClaimOccurrenceId: relevanceOccurrence.sourceClaimOccurrenceId,
					targetConfidenceConnectorOccurrenceId:
						relevanceOccurrence.targetConfidenceConnectorOccurrenceId,
					targetSideOffset: relevanceOffsets[relevanceIndex] ?? 0,
					volumeTransitions: [],
				};
				args.frame.relevanceConnections[relevanceOccurrence.id] = relevanceState;
			});
		});
	}
}

function getClaimLaneMembers(
	resolvedMath: ResolvedPresentationMath,
	claimOccurrence: PresentationClaimOccurrence,
): ClaimLaneMember[] {
	const members: ClaimLaneMember[] = [];

	for (const connectorOccurrenceId of claimOccurrence.confidenceConnectorOccurrenceIds) {
		const confidenceOccurrence = getConfidenceOccurrence(resolvedMath, connectorOccurrenceId);
		members.push({
			claimOccurrenceId: confidenceOccurrence.sourceClaimOccurrenceId,
			connectorOccurrenceId: confidenceOccurrence.id,
			targetRelationship: confidenceOccurrence.targetRelationship,
		});

		for (const relevanceOccurrenceId of confidenceOccurrence.relevanceConnectorOccurrenceIds) {
			const relevanceOccurrence = getRelevanceOccurrence(resolvedMath, relevanceOccurrenceId);
			members.push({
				claimOccurrenceId: relevanceOccurrence.sourceClaimOccurrenceId,
				connectorOccurrenceId: relevanceOccurrence.id,
				targetRelationship: relevanceOccurrence.targetRelationship,
			});
		}
	}

	return members.sort((left, right) => {
		const relationshipDifference = relationshipRank(left.targetRelationship)
			- relationshipRank(right.targetRelationship);
		return relationshipDifference
			|| left.connectorOccurrenceId.localeCompare(right.connectorOccurrenceId);
	});
}

function getClaimOccurrence(
	resolvedMath: ResolvedPresentationMath,
	claimOccurrenceId: PresentationClaimOccurrenceId,
): PresentationClaimOccurrence {
	const occurrence = resolvedMath.presentationGraph.claimOccurrences[claimOccurrenceId];
	if (!occurrence) {
		throw new Error(`Missing presentation claim occurrence: ${claimOccurrenceId}`);
	}

	return occurrence;
}

function getConfidenceOccurrence(
	resolvedMath: ResolvedPresentationMath,
	connectorOccurrenceId: PresentationConnectorOccurrenceId,
): PresentationConfidenceConnectorOccurrence {
	const occurrence = resolvedMath.presentationGraph.connectorOccurrences[connectorOccurrenceId];
	if (!occurrence || occurrence.type !== "confidence") {
		throw new Error(`Missing presentation confidence occurrence: ${connectorOccurrenceId}`);
	}

	return occurrence;
}

function getRelevanceOccurrence(
	resolvedMath: ResolvedPresentationMath,
	connectorOccurrenceId: PresentationConnectorOccurrenceId,
): PresentationRelevanceConnectorOccurrence {
	const occurrence = resolvedMath.presentationGraph.connectorOccurrences[connectorOccurrenceId];
	if (!occurrence || occurrence.type !== "relevance") {
		throw new Error(`Missing presentation relevance occurrence: ${connectorOccurrenceId}`);
	}

	return occurrence;
}

function resolveConnectionEnvelope(args: {
	options: PlannerOptions
	scale: number
}): { bottomOffset: number; topOffset: number } {
	const pipeWidth = args.options.claimHeight * args.scale;
	return {
		bottomOffset: pipeWidth / 2,
		topOffset: -(pipeWidth / 2),
	};
}

function resolveCenteredOffsets(
	envelopes: Array<{ bottomOffset: number; topOffset: number }>,
): number[] {
	const totalHeight = envelopes.reduce(
		(sum, envelope) => sum + (envelope.bottomOffset - envelope.topOffset),
		0,
	);
	let nextTop = -(totalHeight / 2);

	return envelopes.map((envelope) => {
		const offset = nextTop - envelope.topOffset;
		nextTop += envelope.bottomOffset - envelope.topOffset;
		return offset;
	});
}

function relationshipRank(relationship: "proTarget" | "conTarget"): number {
	return relationship === "proTarget" ? 0 : 1;
}

function getRequiredNumber(value: number | undefined, label: string): number {
	if (value === undefined || !Number.isFinite(value)) {
		throw new Error(`Missing finite ${label}`);
	}

	return value;
}

function resolveVisualScale(
	args: {
		resolvedMath: ResolvedPresentationMath
		visualScales?: Partial<Record<PresentationClaimOccurrenceId, number>>
	},
	claimOccurrenceId: PresentationClaimOccurrenceId,
): number {
	return getRequiredNumber(
		args.visualScales?.[claimOccurrenceId]
			?? args.resolvedMath.sourcesScales[claimOccurrenceId],
		`visual scale for ${claimOccurrenceId}`,
	);
}