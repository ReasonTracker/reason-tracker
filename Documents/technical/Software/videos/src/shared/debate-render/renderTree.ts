import type {
    RenderAttributeValue,
    RenderElementNode,
    RenderNode,
    RenderStyleValue,
    RenderTextNode,
} from "./renderTypes";

type ElementInit = {
    attributes?: Record<string, RenderAttributeValue | undefined>;
    children?: Array<RenderNode | undefined>;
    styles?: Record<string, RenderStyleValue | undefined>;
};

const UNITLESS_STYLE_PROPERTIES = new Set([
    "fillOpacity",
    "flex",
    "flexGrow",
    "flexShrink",
    "fontWeight",
    "lineHeight",
    "opacity",
    "order",
    "scale",
    "strokeDashoffset",
    "strokeMiterlimit",
    "strokeOpacity",
    "zIndex",
]);

export function htmlElement(tagName: string, init: ElementInit = {}): RenderElementNode {
    return createElement("html", tagName, init);
}

export function svgElement(tagName: string, init: ElementInit = {}): RenderElementNode {
    return createElement("svg", tagName, init);
}

export function textNode(text: string): RenderTextNode {
    return {
        kind: "text",
        text,
    };
}

export function renderNodeToHtml(node: RenderNode): string {
    if (node.kind === "text") {
        return escapeHtml(node.text);
    }

    const attributes = renderAttributes(node.attributes);
    const styleAttribute = renderStyleAttribute(node.styles);
    const openTag = `<${node.tagName}${attributes}${styleAttribute}>`;
    const children = (node.children ?? []).map(renderNodeToHtml).join("");

    return `${openTag}${children}</${node.tagName}>`;
}

function createElement(
    namespace: RenderElementNode["namespace"],
    tagName: string,
    init: ElementInit,
): RenderElementNode {
    return {
        kind: "element",
        namespace,
        tagName,
        attributes: init.attributes,
        children: (init.children ?? []).filter((child): child is RenderNode => child !== undefined),
        styles: init.styles,
    };
}

function renderAttributes(attributes: Record<string, RenderAttributeValue | undefined> | undefined): string {
    if (!attributes) {
        return "";
    }

    return Object.entries(attributes)
        .flatMap(([name, value]) => {
            if (value === undefined || value === false) {
                return [];
            }

            if (value === true) {
                return [` ${name}`];
            }

            return [` ${name}="${escapeHtml(String(value))}"`];
        })
        .join("");
}

function renderStyleAttribute(styles: Record<string, RenderStyleValue | undefined> | undefined): string {
    if (!styles) {
        return "";
    }

    const declarations = Object.entries(styles)
        .flatMap(([propertyName, value]) => {
            if (value === undefined) {
                return [];
            }

            return [`${toCssPropertyName(propertyName)}:${renderStyleValue(propertyName, value)}`];
        })
        .join(";");

    return declarations.length > 0 ? ` style="${escapeHtml(declarations)}"` : "";
}

function renderStyleValue(propertyName: string, value: RenderStyleValue): string {
    if (typeof value !== "number") {
        return value;
    }

    if (value === 0 || propertyName.startsWith("--") || UNITLESS_STYLE_PROPERTIES.has(propertyName)) {
        return String(value);
    }

    return `${value}px`;
}

function toCssPropertyName(propertyName: string): string {
    if (propertyName.startsWith("--")) {
        return propertyName;
    }

    return propertyName.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}