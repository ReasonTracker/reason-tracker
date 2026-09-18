import { useId, type CSSProperties } from "react";
import rehypeRaw from "rehype-raw";
import ReactMarkdown, { type Components } from "react-markdown";
import "./claimMarkdown.css";
import type { ClaimId } from "@debate-core/Claim.ts";
import type { DebateCore } from "@debate-core/Debate.ts";
import type {
	DebateAnimationPlan,
	DebateFrame,
} from "@planner/DebateAnimationPlan.ts";
import type { PlannerOptions } from "@planner/contracts.ts";
import {
	resolveDebateSceneGeometry,
	type PolygonGeometry,
	type SceneBandGeometry,
} from "./resolveDebateSceneGeometry";
import { resolveDebateGraphOutlineWidth } from "./visualConstants";

const COLORS = {
	con: "var(--con)",
	pro: "var(--pro)",
	shell: "#151b24",
	text: "#f8fafc",
};
const CLAIM_TEXT_FONT_SIZE = 18;
const SCORELESS_CLAIM_TEXT_SCALE = 1.3;
const CLAIM_MARKDOWN_ALLOWED_ELEMENTS = [
	"a",
	"blockquote",
	"br",
	"code",
	"em",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hr",
	"img",
	"li",
	"ol",
	"p",
	"pre",
	"small",
	"span",
	"strong",
	"ul",
];

export type ClaimTextReveal = {
	progress: number
};

export type DebateGraphProps = {
	bounds: DebateAnimationPlan["bounds"]
	claimTextReveals?: Readonly<Record<string, ClaimTextReveal>>
	debateCore: DebateCore
	diagnostics?: boolean
	foregroundConnectorClaimIds?: ReadonlySet<ClaimId>
	foregroundClaimIds?: ReadonlySet<ClaimId>
	frame: DebateFrame
	options: PlannerOptions
	scoreless?: boolean
	showClaimScore?: (claimId: ClaimId) => boolean
};

export function DebateGraph({
	bounds,
	claimTextReveals,
	debateCore,
	diagnostics = false,
	foregroundConnectorClaimIds,
	foregroundClaimIds,
	frame,
	options,
	scoreless = false,
	showClaimScore,
}: DebateGraphProps) {
	const geometry = resolveDebateSceneGeometry({ frame, options });
	const claims = Object.values(frame.claims).sort((left, right) =>
		Number(foregroundClaimIds?.has(left.claimId) ?? false)
		- Number(foregroundClaimIds?.has(right.claimId) ?? false)
	);
	const foregroundConnectorBands = geometry.bands.filter((band) => {
		const sourceClaim = frame.claims[band.sourceClaimOccurrenceId];
		return sourceClaim !== undefined
			&& (foregroundConnectorClaimIds?.has(sourceClaim.claimId) ?? false);
	});
	const regularBands = geometry.bands.filter((band) => !foregroundConnectorBands.includes(band));

	return (
		<div style={rootStyle}>
			<svg
				aria-label="Reason Tracker debate graph"
				preserveAspectRatio="xMidYMid meet"
				style={svgStyle}
				viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
			>
				<g data-layer="connectors">
					<ConnectorBands bands={regularBands} />
				</g>
				<g data-layer="aggregators">
					{geometry.junctions.map((polygon) => (
						<Aggregator key={polygon.id} polygon={polygon} />
					))}
				</g>
				<g data-layer="claims">
					{claims.map((claim) => {
						const claimGeometry = geometry.claims[claim.id];
						const content = debateCore.claims[claim.claimId]?.content ?? String(claim.claimId);
						if (!claimGeometry || claimGeometry.width <= 0 || claimGeometry.height <= 0) {
							return null;
						}

						const color = sideColor(claim.side);
						const outlineWidth = resolveDebateGraphOutlineWidth(claim.scale);
						return (
							<g
								data-claim-id={String(claim.claimId)}
								data-occurrence-id={String(claim.id)}
								key={claim.id}
								opacity={claim.opacity}
							>
								<rect
									fill={color === COLORS.pro
										? "rgb(54 38 83)"
										: "rgb(74 47 23)"}
									height={Math.max(0, claimGeometry.height - outlineWidth)}
									stroke={color}
									strokeWidth={outlineWidth}
									width={Math.max(0, claimGeometry.width - outlineWidth)}
									x={claimGeometry.x + (outlineWidth / 2)}
									y={claimGeometry.y + (outlineWidth / 2)}
								/>
								<foreignObject
									height={claimGeometry.height}
									style={{ overflow: "visible" }}
									width={claimGeometry.width}
									x={claimGeometry.x}
									y={claimGeometry.y}
								>
									<div
										style={{
											...claimCardStyle,
											height: options.claimHeight,
											transform: `scale(${claim.scale})`,
											width: options.claimWidth,
										}}
									>
										<div
											style={{
												...claimContentStyle,
												fontSize: scoreless
													? CLAIM_TEXT_FONT_SIZE * SCORELESS_CLAIM_TEXT_SCALE
													: CLAIM_TEXT_FONT_SIZE,
											}}
										>
											<ClaimMarkdown content={content} reveal={claimTextReveals?.[claim.claimId]} />
										</div>
										{showClaimScore?.(claim.claimId) ?? true
											? (
												<div style={scoreGroupStyle}>
													<div style={scoreStyle}>{Math.round(claim.score * 100)}%</div>
													<div style={scoreCaptionStyle}></div>
												</div>
											)
											: null}
									</div>
								</foreignObject>
							</g>
						);
					})}
				</g>
				{foregroundConnectorBands.length > 0
					? (
						<g data-layer="foreground-connectors">
							<ConnectorBands bands={foregroundConnectorBands} />
						</g>
					)
					: null}
				{diagnostics
					? (
						<g data-layer="diagnostics">
							{geometry.bands.flatMap((band) => [
								<circle fill="#00e5ff" key={`${band.id}:source`} r={4} {...band.sourcePort.center} />,
								<circle fill="#ff2d95" key={`${band.id}:target`} r={4} {...band.targetPort.center} />,
							])}
						</g>
					)
					: null}
			</svg>
		</div>
	);
}

function ConnectorBands({ bands }: { bands: readonly SceneBandGeometry[] }) {
	return (
		<>
			{bands.map((band) => (
				<ConnectorBand band={band} key={`${band.id}:shell`} layer="shell" />
			))}
			{bands.map((band) => (
				<ConnectorBand band={band} key={`${band.id}:fluid`} layer="fluid" />
			))}
		</>
	);
}

function ConnectorBand({
	band,
	layer,
}: {
	band: SceneBandGeometry
	layer: "shell" | "fluid"
}) {
	const color = sideColor(band.side);
	const issueCodes = band.diagnosticIssues.map((issue) => issue.code).join(" ") || undefined;
	const pathData = layer === "shell" ? band.shellPathData : band.fluidPathData;
	const clipPathId = useId();
	if (!pathData) {
		return null;
	}

	return (
		<>
			{layer === "shell"
				? (
					<defs>
						<clipPath id={clipPathId}>
							<path d={pathData} />
						</clipPath>
					</defs>
				)
				: null}
			<g
				data-band-layer={layer}
				data-geometry-issues={issueCodes}
				data-kind={band.kind}
				data-occurrence-id={band.id}
			>
				<path
					clipPath={layer === "shell" ? `url(#${clipPathId})` : undefined}
					d={pathData}
					fill={layer === "shell" ? COLORS.shell : color}
					stroke={layer === "shell" ? color : undefined}
					strokeWidth={layer === "shell" ? band.outlineWidth * 2 : undefined}
				/>
			</g>
		</>
	);
}

function Aggregator({ polygon }: { polygon: PolygonGeometry }) {
	const clipPathId = useId();
	const points = polygon.points.map((point) => `${point.x},${point.y}`).join(" ");
	return (
		<>
			<defs>
				<clipPath id={clipPathId}>
					<polygon points={points} />
				</clipPath>
			</defs>
			<polygon
				clipPath={`url(#${clipPathId})`}
				data-geometry-id={polygon.id}
				fill={COLORS.shell}
				points={points}
				stroke={sideColor(polygon.side)}
				strokeLinejoin="round"
				strokeWidth={polygon.outlineWidth * 2}
			/>
		</>
	);
}

function sideColor(side: "proMain" | "conMain"): string {
	return side === "proMain" ? COLORS.pro : COLORS.con;
}

function ClaimMarkdown({
	content,
	reveal,
}: {
	content: string
	reveal?: ClaimTextReveal
}) {
	return (
		<ReactMarkdown
			allowedElements={CLAIM_MARKDOWN_ALLOWED_ELEMENTS}
			components={createClaimMarkdownComponents()}
			rehypePlugins={[
				rehypeRaw,
				...(reveal && reveal.progress < 1
					? [createMarkdownCharacterRevealPlugin(reveal.progress)]
					: []),
			]}
		>
			{content}
		</ReactMarkdown>
	);
}

type MarkdownNode = {
	children?: MarkdownNode[]
	properties?: Record<string, unknown>
	tagName?: string
	type: string
	value?: string
};

function createMarkdownCharacterRevealPlugin(progress: number) {
	return () => (tree: unknown) => {
		if (!isMarkdownNode(tree)) {
			return;
		}
		const totalCharacterCount = countMarkdownCharacters(tree);
		const visibleCharacterCount = Math.floor(totalCharacterCount * progress);
		wrapMarkdownCharacters(tree, visibleCharacterCount, { characterIndex: 0 });
	};
}

function countMarkdownCharacters(node: MarkdownNode): number {
	return node.type === "text"
		? Array.from(node.value ?? "").length
		: (node.children?.reduce((count, child) => count + countMarkdownCharacters(child), 0) ?? 0);
}

function wrapMarkdownCharacters(
	node: MarkdownNode,
	visibleCharacterCount: number,
	state: { characterIndex: number },
): void {
	if (!node.children) {
		return;
	}
	const children: MarkdownNode[] = [];
	for (const child of node.children) {
		if (child.type !== "text") {
			wrapMarkdownCharacters(child, visibleCharacterCount, state);
			children.push(child);
			continue;
		}
		for (const character of Array.from(child.value ?? "")) {
			const characterIndex = state.characterIndex;
			state.characterIndex += 1;
			children.push({
				children: [{ type: "text", value: character }],
				properties: { "data-reveal-character-hidden": characterIndex >= visibleCharacterCount },
				tagName: "span",
				type: "element",
			});
		}
	}
	node.children = children;
}

function isMarkdownNode(value: unknown): value is MarkdownNode {
	return typeof value === "object"
		&& value !== null
		&& "type" in value
		&& typeof value.type === "string";
}

function createClaimMarkdownComponents(): Components {
	return {
		p: ({ className, node: _node, ...props }) => <p {...props} className={mergeClassNames(className, "reasontracker-claim-markdown__paragraph")} />,
		small: ({ className, node: _node, ...props }) => <small {...props} className={mergeClassNames(className, "reasontracker-claim-markdown__small")} />,
		span: ({ className, node, ...props }) => {
			const hidden = node?.properties["data-reveal-character-hidden"] === true;
			return <span {...props} className={hidden ? mergeClassNames(className, "reasontracker-claim-markdown__character--hidden") : className} />;
		},
	};
}

function mergeClassNames(...classNames: Array<string | undefined>): string {
	return classNames.filter(Boolean).join(" ");
}

const rootStyle: CSSProperties = {
	height: "100%",
	overflow: "hidden",
	width: "100%",
};

const svgStyle: CSSProperties = {
	display: "block",
	height: "100%",
	width: "100%",
};

const claimCardStyle: CSSProperties = {
	boxSizing: "border-box",
	color: COLORS.text,
	display: "flex",
	flexDirection: "column",
	fontFamily: '"Space Grotesk", "Bahnschrift", sans-serif',
	fontWeight: 650,
	justifyContent: "space-between",
	lineHeight: 1.08,
	overflow: "hidden",
	padding: "16px 20px 14px",
	transformOrigin: "top left",
};

const claimContentStyle: CSSProperties = {
	display: "-webkit-box",
	fontSize: CLAIM_TEXT_FONT_SIZE,
	fontWeight: 600,
	overflow: "hidden",
	WebkitBoxOrient: "vertical",
	WebkitLineClamp: 5,
};

const scoreGroupStyle: CSSProperties = {
	alignItems: "flex-start",
	display: "flex",
	flexDirection: "column",
	marginTop: 8,
};

const scoreStyle: CSSProperties = {
	fontSize: 32,
	fontVariantNumeric: "tabular-nums",
	fontWeight: 750,
	lineHeight: 0.92,
};

const scoreCaptionStyle: CSSProperties = {
	color: "#d1d5db",
	fontSize: 11,
	fontWeight: 600,
	lineHeight: 1,
	marginTop: 2,
};
