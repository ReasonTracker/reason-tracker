import { type CSSProperties } from "react";
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
import { DeliveryAggregator } from "./DeliveryAggregator";
import { Pipe } from "./Pipe";
import { resolveDebateSceneGeometry } from "./resolveDebateSceneGeometry";
import {
	DEBATE_GRAPH_COLORS,
	debateGraphSideColor,
	resolveDebateGraphOutlineWidth,
} from "./visualConstants";

// AGENT NOTE: Keep tunable rendering values together below imports.
const COLORS = DEBATE_GRAPH_COLORS;
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

	return (
		<div style={rootStyle}>
			<svg
				aria-label="Reason Tracker debate graph"
				preserveAspectRatio="xMidYMid meet"
				style={svgStyle}
				viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
			>
				<g data-layer="pipe-shells">
					{geometry.bands.map((band) => (
						<Pipe band={band} key={band.id} layer="shell" />
					))}
					{geometry.deliveryAggregators.map((aggregator) => (
						<DeliveryAggregator aggregator={aggregator} key={aggregator.id} layer="shell" />
					))}
				</g>
				<g data-layer="pipe-fluids">
					{geometry.bands.map((band) => (
						<Pipe band={band} fluidBorder key={band.id} layer="fluid" />
					))}
					{geometry.deliveryAggregators.map((aggregator) => (
						<DeliveryAggregator aggregator={aggregator} key={aggregator.id} layer="fluid" />
					))}
				</g>
				<g data-layer="aggregator-borders">
					{geometry.deliveryAggregators.map((aggregator) => (
						<DeliveryAggregator aggregator={aggregator} key={aggregator.id} layer="border" />
					))}
				</g>
				<g data-layer="claims">
					{claims.map((claim) => {
						const claimGeometry = geometry.claims[claim.id];
						if (!claimGeometry || claimGeometry.width <= 0 || claimGeometry.height <= 0) {
							return null;
						}

						const color = debateGraphSideColor(claim.displaySide);
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
											<ClaimMarkdown content={claim.displayContent} reveal={claimTextReveals?.[claim.claimId]} />
										</div>
										{showClaimScore?.(claim.claimId) ?? true
											? (
												<div style={scoreGroupStyle}>
													<div style={scoreStyle}>{Math.round(claim.value * 100)}%</div>
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
