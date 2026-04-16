// See 📌README.md in this folder for local coding standards before editing this file.

import {
	deriveTargetRelation,
	type Change,
	type ConnectorId,
	type Debate,
	type Intent,
	type ScoreId,
} from "../../contracts/src/index.ts";
import type { DebateLayout, DebateLayoutPipelineContext } from "../../engine/src/index.ts";

const DEFAULT_STYLESHEET_HREF = "reason-tracker-renderer.css";
const DEFAULT_STYLESHEET_SOURCE_PATH = "./src/renderHtml.css";
const DEFAULT_BRAND_STYLESHEET_HREF = "../website/site/css/brand.css";
const DEFAULT_CLAIM_WIDTH = 320;
const DEFAULT_CLAIM_HEIGHT = 180;

export interface RenderHtmlRequest extends DebateLayoutPipelineContext {
	previousDebate?: Debate
	previousLayout?: DebateLayout
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
	claimConfidence: number
	reversibleClaimConfidence: number
	relevance: number
	x: number
	y: number
	width: number
	height: number
	scale: number
	isRoot: boolean
	isLeaf: boolean
	presence: "current" | "exiting"
	animationKind: ScoreAnimationKind
	animationDirection?: string
	label: string
	changeKind?: string
	intentKind?: string
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
	changeKind?: string
	intentKind?: string
}

export function renderHtml(request: RenderHtmlRequest): RenderHtmlResult {
	const resolvedIntent = request.intent;
	const resolvedChanges = request.changes ?? resolvedIntent?.changes ?? [];
	const scoreVisuals = buildScoreVisuals(request, resolvedIntent, resolvedChanges);
	const connectorVisuals = buildConnectorVisuals(request, resolvedIntent, resolvedChanges);
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
			intentKind: resolvedIntent?.kind,
			changeKind: resolvedChanges[0]?.kind,
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

function buildScoreVisuals(
	request: RenderHtmlRequest,
	intent: Intent | undefined,
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
			claimConfidence: currentScore?.claimConfidence ?? previousScore?.claimConfidence ?? 0,
			reversibleClaimConfidence: currentScore?.reversibleClaimConfidence ?? previousScore?.reversibleClaimConfidence ?? 0,
			relevance: currentScore?.relevance ?? previousScore?.relevance ?? 0,
			x: layout.x,
			y: layout.y,
			width: layout.width,
			height: layout.height,
			scale: resolveScoreShapeScale(layout.width, layout.height),
			isRoot: layout.isRoot,
			isLeaf: layout.isLeaf,
			presence,
			animationKind: deriveScoreAnimationKind({
				intent,
				changes,
				scoreId,
				claimId: score.claimId,
				currentLayout,
				previousLayout,
				presence,
			}),
			animationDirection: directionByScoreId[scoreId],
			label: formatConfidencePercent(currentScore?.claimConfidence ?? previousScore?.claimConfidence ?? 0),
			changeKind: resolvePrimaryChangeKindForScore(changes, scoreId, score.claimId),
			intentKind: intent?.kind,
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
				changes,
				connectorId,
				sourceClaimId: connector.source,
				sourceScoreId,
				currentRoute,
				previousRoute,
				presence,
			}),
			animationDirection: sourceScoreId ? directionByScoreId[sourceScoreId] : undefined,
			changeKind: resolvePrimaryChangeKindForConnector(changes, connectorId, sourceScoreId),
			intentKind: intent?.kind,
		});
	}

	return visuals.sort((left, right) => left.strokeWidth - right.strokeWidth);
}

function deriveScoreAnimationKind(args: {
	intent: Intent | undefined
	changes: Change[]
	scoreId: ScoreId
	claimId: string
	currentLayout: DebateLayout["scoreLayouts"][ScoreId] | undefined
	previousLayout: DebateLayout["scoreLayouts"][ScoreId] | undefined
	presence: "current" | "exiting"
}): ScoreAnimationKind {
	if (args.presence === "exiting") {
		if (args.intent?.kind === "MoveClaim" && args.intent.claimId === args.claimId) {
			return "move-exit";
		}

		return "remove-exit";
	}

	if (!args.previousLayout) {
		if (args.intent?.kind === "MoveClaim" && args.intent.claimId === args.claimId) {
			return "move-enter";
		}

		if (args.changes.some((change) => change.kind === "ClaimAdded" && change.claim.id === args.claimId)) {
			return "claim-enter";
		}

		if (args.changes.some((change) => change.kind === "ScoreAdded" && change.score.id === args.scoreId)) {
			return "connection-enter";
		}

		return "claim-enter";
	}

	if (args.changes.some((change) => isClaimScopedChange(change, args.claimId))) {
		return "claim-change";
	}

	if (args.changes.some((change) => isScoreScopedChange(change, args.scoreId))) {
		return "score-change";
	}

	if (hasLayoutChange(args.previousLayout, args.currentLayout)) {
		return "move";
	}

	return "stable";
}

function deriveConnectorAnimationKind(args: {
	intent: Intent | undefined
	changes: Change[]
	connectorId: ConnectorId
	sourceClaimId: string
	sourceScoreId: ScoreId | undefined
	currentRoute: DebateLayout["connectorRoutes"][ConnectorId] | undefined
	previousRoute: DebateLayout["connectorRoutes"][ConnectorId] | undefined
	presence: "current" | "exiting"
}): ConnectorAnimationKind {
	if (args.presence === "exiting") {
		if (args.intent?.kind === "MoveClaim") {
			return "move-exit";
		}

		return "remove-exit";
	}

	if (!args.previousRoute) {
		if (args.intent?.kind === "MoveClaim") {
			return "move-enter";
		}

		if (args.changes.some((change) => change.kind === "ClaimAdded" && change.claim.id === args.sourceClaimId)) {
			return "claim-enter";
		}

		if (args.changes.some((change) => change.kind === "ConnectorAdded" && change.connector.id === args.connectorId)) {
			return "connection-enter";
		}

		return "connection-enter";
	}

	const sourceScoreId = args.sourceScoreId;
	if (sourceScoreId && args.changes.some((change) => isScoreScopedChange(change, sourceScoreId))) {
		return "score-change";
	}

	if (args.changes.some((change) => isConnectorScopedChange(change, args.connectorId))) {
		return "reroute";
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
	intentKind: string | undefined
	changeKind: string | undefined
	scoreVisuals: ScoreVisual[]
	connectorVisuals: ConnectorVisual[]
}): string {
	const documentId = buildDomId(args.idPrefix, "debate", args.debateId);
	const graphId = buildDomId(args.idPrefix, "graph", args.debateId);
	const connectorLayerId = buildDomId(args.idPrefix, "connector-layer", args.debateId);

	return [
		`<main id="${escapeHtml(documentId)}" class="rt-document" data-instance-prefix="${escapeHtml(args.idPrefix)}" data-debate-id="${escapeHtml(args.debateId)}" data-intent-kind="${escapeHtml(args.intentKind ?? "none")}" data-change-kind="${escapeHtml(args.changeKind ?? "none")}">`,
		`<section class="rt-stage" aria-label="Reason Tracker graph">`,
		`<div id="${escapeHtml(graphId)}" class="rt-graph">`,
		`<div class="rt-layout-canvas" style="width:${formatNumber(args.bounds.width)}px;height:${formatNumber(args.bounds.height)}px">`,
		renderConnectorLayer(args.bounds, args.connectorVisuals, connectorLayerId, args.idPrefix),
		args.scoreVisuals.map((score) => renderScoreCard(score, args.idPrefix)).join("\n"),
		"</div>",
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
	return `<path id="${escapeHtml(buildDomId(idPrefix, "connector", connector.connectorId))}" class="rt-connector" data-connector-id="${escapeHtml(connector.connectorId)}" data-presence="${connector.presence}" data-animation-kind="${connector.animationKind}" data-animation-direction="${escapeHtml(connector.animationDirection ?? "none")}" data-change-kind="${escapeHtml(connector.changeKind ?? "none")}" data-intent-kind="${escapeHtml(connector.intentKind ?? "none")}" data-affects="${escapeHtml(connector.affects)}" data-target-relation="${escapeHtml(connector.targetRelation)}" data-connector-side="${escapeHtml(connector.sourceClaimSide)}" style="stroke-width:${formatNumber(connector.strokeWidth)}px" d="${escapeHtml(connector.pathD)}" />`;
}

function renderScoreCard(score: ScoreVisual, idPrefix: string): string {
	return [
		`<article id="${escapeHtml(buildDomId(idPrefix, "score", score.scoreId))}" class="rt-score-card" data-score-id="${escapeHtml(score.scoreId)}" data-claim-id="${escapeHtml(score.claimId)}" data-claim-side="${escapeHtml(score.claimSide)}" data-presence="${score.presence}" data-animation-kind="${score.animationKind}" data-animation-direction="${escapeHtml(score.animationDirection ?? "none")}" data-change-kind="${escapeHtml(score.changeKind ?? "none")}" data-intent-kind="${escapeHtml(score.intentKind ?? "none")}" data-is-root="${String(score.isRoot)}" data-is-leaf="${String(score.isLeaf)}" style="left:${formatNumber(score.x)}px;top:${formatNumber(score.y)}px;width:${formatNumber(score.width)}px;height:${formatNumber(score.height)}px">`,
		`<div class="rt-claim-shape" style="width:${DEFAULT_CLAIM_WIDTH}px;height:${DEFAULT_CLAIM_HEIGHT}px;--rt-claim-shape-scale:${formatNumber(score.scale)};--rt-claim-insert-scale:1">`,
		`<article class="rt-score-card__body rt-claim-shape-body">`,
		`<div class="rt-score-card__content">${escapeHtml(score.claimContent)}</div>`,
		`<small class="rt-score-card__label" data-score="${escapeHtml(score.label)}" data-score-id="${escapeHtml(score.scoreId)}">${escapeHtml(score.label)}</small>`,
		"</article>",
		"</div>",
		"</article>",
	].join("\n");
}

function resolveScoreShapeScale(width: number, height: number): number {
	return Math.min(width / DEFAULT_CLAIM_WIDTH, height / DEFAULT_CLAIM_HEIGHT);
}

function buildDirectionByScoreId(changes: Change[]): Partial<Record<ScoreId, string>> {
	const directionByScoreId: Partial<Record<ScoreId, string>> = {};
	for (const change of changes) {
		switch (change.kind) {
			case "ScoreClaimConfidenceChanged":
			case "ScoreConnectorConfidenceChanged":
			case "ScoreRelevanceChanged":
			case "ScoreScaleOfSourcesChanged":
				directionByScoreId[change.scoreId] = change.direction;
				break;
			case "IncomingSourceInserted":
			case "IncomingSourceRemoved":
				directionByScoreId[change.sourceScoreId] = change.direction;
				break;
			default:
				break;
		}
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

function isClaimScopedChange(change: Change, claimId: string): boolean {
	switch (change.kind) {
		case "ClaimAdded":
		case "ClaimRemoved":
			return change.claim.id === claimId;
		case "ClaimContentChanged":
		case "ClaimSideChanged":
		case "ClaimForceConfidenceChanged":
			return change.claimId === claimId;
		default:
			return false;
	}
}

function isScoreScopedChange(change: Change, scoreId: ScoreId): boolean {
	switch (change.kind) {
		case "ScoreAdded":
		case "ScoreRemoved":
			return change.score.id === scoreId;
		case "ScoreClaimConfidenceChanged":
		case "ScoreConnectorConfidenceChanged":
		case "ScoreRelevanceChanged":
		case "ScoreScaleOfSourcesChanged":
			return change.scoreId === scoreId;
		case "ScoreScaleOfSourcesBatchChanged":
			return change.changes.some((entry) => entry.scoreId === scoreId);
		case "IncomingSourceInserted":
		case "IncomingSourceRemoved":
			return change.sourceScoreId === scoreId || change.targetScoreId === scoreId;
		case "IncomingSourcesResorted":
			return change.targetScoreId === scoreId;
		default:
			return false;
	}
}

function isConnectorScopedChange(change: Change, connectorId: ConnectorId): boolean {
	switch (change.kind) {
		case "ConnectorAdded":
		case "ConnectorRemoved":
			return change.connector.id === connectorId;
		case "ConnectorSourceChanged":
		case "ConnectorTargetChanged":
		case "ConnectorAffectsChanged":
			return change.connectorId === connectorId;
		default:
			return false;
	}
}

function resolvePrimaryChangeKindForScore(changes: Change[], scoreId: ScoreId, claimId: string): string | undefined {
	return changes.find((change) => isScoreScopedChange(change, scoreId) || isClaimScopedChange(change, claimId))?.kind;
}

function resolvePrimaryChangeKindForConnector(
	changes: Change[],
	connectorId: ConnectorId,
	sourceScoreId: ScoreId | undefined,
): string | undefined {
	return changes.find((change) => isConnectorScopedChange(change, connectorId) || (sourceScoreId ? isScoreScopedChange(change, sourceScoreId) : false))?.kind;
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
