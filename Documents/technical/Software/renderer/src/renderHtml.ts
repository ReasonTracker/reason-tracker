// See 📌README.md in this folder for local coding standards before editing this file.

import type { Debate } from "../../contracts/src/Debate.ts";
import { deriveTargetRelation } from "../../contracts/src/Connector.ts";
import type { DebateLayout } from "../../engine/src/index.ts";
import type {
	AppliedAddConnectionStep,
	AppliedAddLeafClaimStep,
	AppliedChangeClaimStep,
	AppliedRemoveConnectionStep,
	Change,
	Intent,
	IntentSequence,
	RecordId,
	Step,
} from "../../contracts/src/IntentSequence.ts";
import type { ConnectorId } from "../../contracts/src/Connector.ts";
import type { ScoreId } from "../../contracts/src/Score.ts";

const DEFAULT_STYLESHEET_HREF = "reason-tracker-renderer.css";
const DEFAULT_STYLESHEET_SOURCE_PATH = "./src/renderHtml.css";
const DEFAULT_BRAND_STYLESHEET_HREF = "../website/site/css/brand.css";

export interface RenderHtmlRequest {
	debate: Debate
	layout: DebateLayout
	previousDebate?: Debate
	previousLayout?: DebateLayout
	intent?: Intent
	intentSequence?: IntentSequence
	stepId?: RecordId
	changes?: Change[]
	title?: string
	stylesheetHref?: string
	brandStylesheetHref?: string
	idPrefix?: string
}

export interface RenderHtmlStylesheetAsset {
	href: string
	sourcePath: string
}

export interface RenderHtmlResult {
	html: string
	inlineCss: string
	stylesheets: RenderHtmlStylesheetAsset[]
}

type ScoreAnimationKind =
	| "stable"
	| "claim-enter"
	| "connection-enter"
	| "move-enter"
	| "move-exit"
	| "remove-exit"
	| "move"
	| "score-change"
	| "claim-change";

type ConnectorAnimationKind =
	| "stable"
	| "claim-enter"
	| "connection-enter"
	| "move-enter"
	| "move-exit"
	| "remove-exit"
	| "reroute"
	| "score-change";

interface ScoreVisual {
	scoreId: ScoreId
	claimId: string
	claimContent: string
	claimSide: string
	confidence: number
	reversibleConfidence: number
	relevance: number
	x: number
	y: number
	width: number
	height: number
	isRoot: boolean
	isLeaf: boolean
	presence: "current" | "exiting"
	animationKind: ScoreAnimationKind
	animationDirection?: string
	label: string
	stepType?: string
	intentType?: string
}

interface ConnectorVisual {
	connectorId: ConnectorId
	sourceClaimSide: string
	targetRelation: string
	affects: string
	pathD: string
	strokeWidth: number
	presence: "current" | "exiting"
	animationKind: ConnectorAnimationKind
	animationDirection?: string
	stepType?: string
	intentType?: string
}

export function renderHtml(request: RenderHtmlRequest): RenderHtmlResult {
	const resolvedIntent = request.intentSequence?.intent ?? request.intent;
	const resolvedStep = resolveStep(request.intentSequence, request.stepId);
	const resolvedChanges = request.changes ?? (resolvedStep?.type === "RecalculationWaveStep" ? resolvedStep.changes : []);
	const scoreVisuals = buildScoreVisuals(request, resolvedIntent, resolvedStep, resolvedChanges);
	const connectorVisuals = buildConnectorVisuals(request, resolvedIntent, resolvedStep, resolvedChanges);
	const title = request.title?.trim() || request.debate.name || "Reason Tracker";
	const stylesheetHref = request.stylesheetHref?.trim() || DEFAULT_STYLESHEET_HREF;
	const brandStylesheetHref = request.brandStylesheetHref?.trim() || DEFAULT_BRAND_STYLESHEET_HREF;
	const idPrefix = normalizeIdPrefix(request.idPrefix);

	const html = [
		"<!doctype html>",
		"<html lang=\"en\">",
		"<head>",
		"<meta charset=\"utf-8\">",
		"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
		`<title>${escapeHtml(title)}</title>`,
		...(brandStylesheetHref ? [`<link rel=\"stylesheet\" href=\"${escapeHtml(brandStylesheetHref)}\">`] : []),
		`<link rel=\"stylesheet\" href=\"${escapeHtml(stylesheetHref)}\">`,
		"</head>",
		"<body>",
		renderDocumentBody({
			debateId: request.debate.id,
			idPrefix,
			title,
			bounds: request.layout.bounds,
			intentType: resolvedIntent?.type,
			stepType: resolvedStep?.type,
			scoreVisuals,
			connectorVisuals,
		}),
		"</body>",
		"</html>",
	].join("\n");

	return {
		html,
		inlineCss: "",
		stylesheets: [
			{
				href: stylesheetHref,
				sourcePath: DEFAULT_STYLESHEET_SOURCE_PATH,
			},
		],
	};
}

function resolveStep(intentSequence: IntentSequence | undefined, stepId: RecordId | undefined): Step | undefined {
	if (!intentSequence || !stepId) {
		return undefined;
	}

	const step = intentSequence.steps.find((candidate) => candidate.id === stepId);
	if (!step) {
		throw new Error(`Step ${stepId} was not found in the provided intent sequence.`);
	}

	return step;
}

function buildScoreVisuals(
	request: RenderHtmlRequest,
	intent: Intent | undefined,
	step: Step | undefined,
	changes: Change[],
): ScoreVisual[] {
	const visuals: ScoreVisual[] = [];
	const scoreIds = new Set<ScoreId>([
		...(Object.keys(request.layout.scoreLayouts) as ScoreId[]),
		...((request.previousLayout ? Object.keys(request.previousLayout.scoreLayouts) : []) as ScoreId[]),
	]);
	const directionByScoreId = buildDirectionByScoreId(changes);

	for (const scoreId of scoreIds) {
		const currentLayout = request.layout.scoreLayouts[scoreId];
		const previousLayout = request.previousLayout?.scoreLayouts[scoreId];
		const currentScore = request.debate.scores[scoreId];
		const previousScore = request.previousDebate?.scores[scoreId];
		const score = currentScore ?? previousScore;
		if (!score) {
			continue;
		}

		const claim = request.debate.claims[score.claimId] ?? request.previousDebate?.claims[score.claimId];
		if (!claim) {
			continue;
		}

		if (!currentLayout && !previousLayout) {
			continue;
		}

		const layout = currentLayout ?? previousLayout;
		if (!layout) {
			continue;
		}

		const presence = currentLayout ? "current" : "exiting";
		visuals.push({
			scoreId,
			claimId: score.claimId,
			claimContent: claim.content,
			claimSide: claim.side,
			confidence: currentScore?.confidence ?? previousScore?.confidence ?? 0,
			reversibleConfidence: currentScore?.reversibleConfidence ?? previousScore?.reversibleConfidence ?? 0,
			relevance: currentScore?.relevance ?? previousScore?.relevance ?? 0,
			x: layout.x,
			y: layout.y,
			width: layout.width,
			height: layout.height,
			isRoot: layout.isRoot,
			isLeaf: layout.isLeaf,
			presence,
			animationKind: deriveScoreAnimationKind({
				intent,
				step,
				changes,
				scoreId,
				claimId: score.claimId,
				currentLayout,
				previousLayout,
				presence,
			}),
			animationDirection: directionByScoreId[scoreId],
			label: formatConfidencePercent(currentScore?.confidence ?? previousScore?.confidence ?? 0),
			stepType: step?.type,
			intentType: intent?.type,
		});
	}

	return visuals.sort((left, right) => {
		if (left.presence !== right.presence) {
			return left.presence === "exiting" ? -1 : 1;
		}
		if (left.x !== right.x) {
			return left.x - right.x;
		}
		return left.y - right.y;
	});
}

function buildConnectorVisuals(
	request: RenderHtmlRequest,
	intent: Intent | undefined,
	step: Step | undefined,
	changes: Change[],
): ConnectorVisual[] {
	const visuals: ConnectorVisual[] = [];
	const connectorIds = new Set<ConnectorId>([
		...(Object.keys(request.layout.connectorRoutes) as ConnectorId[]),
		...((request.previousLayout ? Object.keys(request.previousLayout.connectorRoutes) : []) as ConnectorId[]),
	]);
	const directionByScoreId = buildDirectionByScoreId(changes);

	for (const connectorId of connectorIds) {
		const connector = request.debate.connectors[connectorId] ?? request.previousDebate?.connectors[connectorId];
		if (!connector) {
			continue;
		}

		const currentRoute = request.layout.connectorRoutes[connectorId];
		const previousRoute = request.previousLayout?.connectorRoutes[connectorId];
		if (!currentRoute && !previousRoute) {
			continue;
		}

		const sourceClaim = request.debate.claims[connector.source] ?? request.previousDebate?.claims[connector.source];
		const targetClaim = request.debate.claims[connector.target] ?? request.previousDebate?.claims[connector.target];
		if (!sourceClaim || !targetClaim) {
			continue;
		}

		const route = currentRoute ?? previousRoute;
		if (!route) {
			continue;
		}

		const sourceScoreId = findScoreIdByConnectorId(request.debate, connectorId)
			?? findScoreIdByConnectorId(request.previousDebate, connectorId);
		const presence = currentRoute ? "current" : "exiting";
		visuals.push({
			connectorId,
			sourceClaimSide: sourceClaim.side,
			targetRelation: deriveTargetRelation(sourceClaim.side, targetClaim.side),
			affects: connector.affects,
			pathD: toPathD(route.path),
			strokeWidth: route.strokeWidth,
			presence,
			animationKind: deriveConnectorAnimationKind({
				intent,
				step,
				changes,
				connectorId,
				sourceScoreId,
				currentRoute,
				previousRoute,
				presence,
			}),
			animationDirection: sourceScoreId ? directionByScoreId[sourceScoreId] : undefined,
			stepType: step?.type,
			intentType: intent?.type,
		});
	}

	return visuals.sort((left, right) => left.strokeWidth - right.strokeWidth);
}

function deriveScoreAnimationKind(args: {
	intent: Intent | undefined
	step: Step | undefined
	changes: Change[]
	scoreId: ScoreId
	claimId: string
	currentLayout: DebateLayout["scoreLayouts"][ScoreId] | undefined
	previousLayout: DebateLayout["scoreLayouts"][ScoreId] | undefined
	presence: "current" | "exiting"
}): ScoreAnimationKind {
	if (args.presence === "exiting") {
		if (args.intent?.type === "ReceivedMoveClaimIntent" && args.intent.claimId === args.claimId) {
			return "move-exit";
		}

		return "remove-exit";
	}

	if (!args.previousLayout) {
		if (args.intent?.type === "ReceivedMoveClaimIntent" && args.intent.claimId === args.claimId) {
			return "move-enter";
		}

		if (args.step?.type === "AppliedAddConnectionStep" && args.step.score.id === args.scoreId) {
			return "connection-enter";
		}

		if (args.step?.type === "AppliedAddLeafClaimStep" && args.step.score.id === args.scoreId) {
			return "claim-enter";
		}

		return "claim-enter";
	}

	if (args.step?.type === "AppliedChangeClaimStep" && matchesClaimStep(args.step, args.claimId)) {
		return "claim-change";
	}

	if (args.changes.some((change) => change.scoreId === args.scoreId)) {
		return "score-change";
	}

	if (hasLayoutChange(args.previousLayout, args.currentLayout)) {
		return "move";
	}

	return "stable";
}

function deriveConnectorAnimationKind(args: {
	intent: Intent | undefined
	step: Step | undefined
	changes: Change[]
	connectorId: ConnectorId
	sourceScoreId: ScoreId | undefined
	currentRoute: DebateLayout["connectorRoutes"][ConnectorId] | undefined
	previousRoute: DebateLayout["connectorRoutes"][ConnectorId] | undefined
	presence: "current" | "exiting"
}): ConnectorAnimationKind {
	if (args.presence === "exiting") {
		if (args.intent?.type === "ReceivedMoveClaimIntent") {
			return "move-exit";
		}

		return "remove-exit";
	}

	if (!args.previousRoute) {
		if (args.intent?.type === "ReceivedMoveClaimIntent") {
			return "move-enter";
		}

		if (args.step?.type === "AppliedAddConnectionStep" && args.step.connector.id === args.connectorId) {
			return "connection-enter";
		}

		if (args.step?.type === "AppliedAddLeafClaimStep" && args.step.connector.id === args.connectorId) {
			return "claim-enter";
		}

		return "connection-enter";
	}

	if (args.sourceScoreId && args.changes.some((change) => change.scoreId === args.sourceScoreId)) {
		return "score-change";
	}

	if (hasConnectorRouteChange(args.previousRoute, args.currentRoute)) {
		return "reroute";
	}

	return "stable";
}

function renderDocumentBody(args: {
	debateId: string
	idPrefix: string
	title: string
	bounds: DebateLayout["bounds"]
	intentType: string | undefined
	stepType: string | undefined
	scoreVisuals: ScoreVisual[]
	connectorVisuals: ConnectorVisual[]
}): string {
	const documentId = buildDomId(args.idPrefix, "debate", args.debateId);
	const graphId = buildDomId(args.idPrefix, "graph", args.debateId);
	const connectorLayerId = buildDomId(args.idPrefix, "connector-layer", args.debateId);

	return [
		`<main id="${escapeHtml(documentId)}" class="rt-document" data-instance-prefix="${escapeHtml(args.idPrefix)}" data-debate-id="${escapeHtml(args.debateId)}" data-intent-type="${escapeHtml(args.intentType ?? "none")}" data-step-type="${escapeHtml(args.stepType ?? "none")}">`,
		`<header class=\"rt-header\"><h1 class=\"rt-title\">${escapeHtml(args.title)}</h1></header>`,
		`<section class=\"rt-stage\" aria-label=\"Reason Tracker graph\">`,
		`<div id="${escapeHtml(graphId)}" class="rt-graph" style="width:${formatNumber(args.bounds.width)}px;height:${formatNumber(args.bounds.height)}px">`,
		renderConnectorLayer(args.bounds, args.connectorVisuals, connectorLayerId, args.idPrefix),
		args.scoreVisuals.map((score) => renderScoreCard(score, args.idPrefix)).join("\n"),
		"</div>",
		"</section>",
		"</main>",
	].join("\n");
}

function renderConnectorLayer(
	bounds: DebateLayout["bounds"],
	connectorVisuals: ConnectorVisual[],
	connectorLayerId: string,
	idPrefix: string,
): string {
	return [
		`<svg id="${escapeHtml(connectorLayerId)}" class="rt-connector-layer" viewBox="0 0 ${formatNumber(bounds.width)} ${formatNumber(bounds.height)}" width="${formatNumber(bounds.width)}" height="${formatNumber(bounds.height)}" aria-hidden="true">`,
		connectorVisuals.map((connector) => renderConnectorPath(connector, idPrefix)).join("\n"),
		"</svg>",
	].join("\n");
}

function renderConnectorPath(connector: ConnectorVisual, idPrefix: string): string {
	return `<path id="${escapeHtml(buildDomId(idPrefix, "connector", connector.connectorId))}" class="rt-connector" data-connector-id="${escapeHtml(connector.connectorId)}" data-presence="${connector.presence}" data-animation-kind="${connector.animationKind}" data-animation-direction="${escapeHtml(connector.animationDirection ?? "none")}" data-step-type="${escapeHtml(connector.stepType ?? "none")}" data-intent-type="${escapeHtml(connector.intentType ?? "none")}" data-affects="${escapeHtml(connector.affects)}" data-target-relation="${escapeHtml(connector.targetRelation)}" data-connector-side="${escapeHtml(connector.sourceClaimSide)}" style="stroke-width:${formatNumber(connector.strokeWidth)}px" d="${escapeHtml(connector.pathD)}" />`;
}

function renderScoreCard(score: ScoreVisual, idPrefix: string): string {
	return [
		`<article id="${escapeHtml(buildDomId(idPrefix, "score", score.scoreId))}" class="rt-score-card" data-score-id="${escapeHtml(score.scoreId)}" data-claim-id="${escapeHtml(score.claimId)}" data-claim-side="${escapeHtml(score.claimSide)}" data-presence="${score.presence}" data-animation-kind="${score.animationKind}" data-animation-direction="${escapeHtml(score.animationDirection ?? "none")}" data-step-type="${escapeHtml(score.stepType ?? "none")}" data-intent-type="${escapeHtml(score.intentType ?? "none")}" data-is-root="${String(score.isRoot)}" data-is-leaf="${String(score.isLeaf)}" style="left:${formatNumber(score.x)}px;top:${formatNumber(score.y)}px;width:${formatNumber(score.width)}px;height:${formatNumber(score.height)}px">`,
		`<div class=\"rt-score-card__body\">`,
		`<div class=\"rt-score-card__eyebrow\">${escapeHtml(score.label)}</div>`,
		`<h2 class=\"rt-score-card__content\">${escapeHtml(score.claimContent)}</h2>`,
		`<dl class=\"rt-score-card__metrics\">`,
		`<div><dt>Confidence</dt><dd>${escapeHtml(formatConfidencePercent(score.confidence))}</dd></div>`,
		`<div><dt>Relevance</dt><dd>${escapeHtml(formatMetric(score.relevance))}</dd></div>`,
		"</dl>",
		"</div>",
		"</article>",
	].join("\n");
}

function buildDirectionByScoreId(changes: Change[]): Partial<Record<ScoreId, string>> {
	const directionByScoreId: Partial<Record<ScoreId, string>> = {};
	for (const change of changes) {
		directionByScoreId[change.scoreId] = change.direction;
	}
	return directionByScoreId;
}

function hasLayoutChange(
	previousLayout: DebateLayout["scoreLayouts"][ScoreId] | undefined,
	currentLayout: DebateLayout["scoreLayouts"][ScoreId] | undefined,
): boolean {
	if (!previousLayout || !currentLayout) {
		return false;
	}

	return previousLayout.x !== currentLayout.x
		|| previousLayout.y !== currentLayout.y
		|| previousLayout.width !== currentLayout.width
		|| previousLayout.height !== currentLayout.height;
}

function hasConnectorRouteChange(
	previousRoute: DebateLayout["connectorRoutes"][ConnectorId] | undefined,
	currentRoute: DebateLayout["connectorRoutes"][ConnectorId] | undefined,
): boolean {
	if (!previousRoute || !currentRoute) {
		return false;
	}

	return previousRoute.strokeWidth !== currentRoute.strokeWidth
		|| toPathD(previousRoute.path) !== toPathD(currentRoute.path);
}

function matchesClaimStep(step: AppliedChangeClaimStep, claimId: string): boolean {
	return step.claimAfter.id === claimId;
}

function findScoreIdByConnectorId(debate: Debate | undefined, connectorId: ConnectorId): ScoreId | undefined {
	if (!debate) {
		return undefined;
	}

	for (const score of Object.values(debate.scores)) {
		if (score.connectorId === connectorId) {
			return score.id;
		}
	}

	return undefined;
}

function toPathD(points: DebateLayout["connectorRoutes"][ConnectorId]["path"]): string {
	if (points.length === 0) {
		return "";
	}

	return points.map((point, index) => `${index === 0 ? "M" : "L"} ${formatNumber(point.x)} ${formatNumber(point.y)}`).join(" ");
}

function formatConfidencePercent(confidence: number): string {
	return `${Math.round(confidence * 100)}%`;
}

function formatMetric(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatNumber(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function normalizeIdPrefix(prefix: string | undefined): string {
	const trimmed = prefix?.trim();
	if (!trimmed) {
		return "";
	}

	const normalized = trimmed
		.replace(/[^A-Za-z0-9_-]+/g, "-")
		.replace(/^-+/, "")
		.replace(/-+$/, "");

	return normalized.length > 0 ? `${normalized}--` : "";
}

function buildDomId(prefix: string, kind: string, value: string): string {
	return `${prefix}${kind}-${value}`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}