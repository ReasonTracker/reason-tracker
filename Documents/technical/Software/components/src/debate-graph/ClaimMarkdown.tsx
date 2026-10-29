import rehypeRaw from "rehype-raw";
import ReactMarkdown, { type Components } from "react-markdown";
import "./claimMarkdown.css";

export type ClaimTextReveal = {
	progress: number
};

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

export function ClaimMarkdown({
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
