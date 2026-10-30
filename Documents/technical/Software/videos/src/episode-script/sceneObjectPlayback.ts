import type {
	CompiledEpisodeScript,
	CompiledSceneObject,
	ResolvedSceneObjectState,
	SceneTarget,
} from "../episode-script/compileEpisodeScript";
import type { CssStyle, ObjectLayout } from "../episode-script/episodeScriptSpec";

export function resolveSceneObjectStates(
	episode: CompiledEpisodeScript,
	frame: number,
): readonly (ResolvedSceneObjectState & Pick<CompiledSceneObject, "key">)[] {
	return episode.sceneObjects
		.filter((sceneObject) => sceneObject.from <= frame)
		.map((sceneObject) => ({
			...resolveSceneObjectState(sceneObject, frame),
			key: sceneObject.key,
		}));
}

export function resolveObjectLayoutBounds(layout: ObjectLayout): SceneTarget["bounds"] {
	const originX = layout.originX ?? layout.width / 2;
	const originY = layout.originY ?? layout.height / 2;
	const radians = layout.rotation * (Math.PI / 180);
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const corners = [
		[0, 0],
		[layout.width, 0],
		[layout.width, layout.height],
		[0, layout.height],
	].map(([x, y]) => {
		const scaledX = (x! - originX) * layout.scale;
		const scaledY = (y! - originY) * layout.scale;
		return {
			x: layout.x + originX + (scaledX * cosine) - (scaledY * sine),
			y: layout.y + originY + (scaledX * sine) + (scaledY * cosine),
		};
	});
	const minX = Math.min(...corners.map((corner) => corner.x));
	const minY = Math.min(...corners.map((corner) => corner.y));
	const maxX = Math.max(...corners.map((corner) => corner.x));
	const maxY = Math.max(...corners.map((corner) => corner.y));
	return { height: maxY - minY, minX, minY, width: maxX - minX };
}

function resolveSceneObjectState(
	sceneObject: CompiledSceneObject,
	frame: number,
): ResolvedSceneObjectState {
	let state = sceneObject.initialState;
	for (const transition of sceneObject.transitions) {
		if (frame < transition.from) {
			break;
		}
		const progress = transition.durationInFrames <= 1
			? 1
			: Math.min(1, (frame - transition.from) / (transition.durationInFrames - 1));
		state = interpolateSceneObjectState(transition.initialState, transition.targetState, progress);
	}
	return state;
}

function interpolateSceneObjectState(
	initialState: ResolvedSceneObjectState,
	targetState: ResolvedSceneObjectState,
	progress: number,
): ResolvedSceneObjectState {
	return {
		anchor: initialState.anchor,
		layout: interpolateObjectLayout(initialState.layout, targetState.layout, progress),
		object: interpolateSceneObject(initialState.object, targetState.object, progress),
		style: interpolateCssStyle(initialState.style, targetState.style, progress),
	};
}

function interpolateObjectLayout(
	initialLayout: ObjectLayout,
	targetLayout: ObjectLayout,
	progress: number,
): ObjectLayout {
	return {
		height: interpolateNumber(initialLayout.height, targetLayout.height, progress),
		originX: interpolateNumber(
			initialLayout.originX ?? initialLayout.width / 2,
			targetLayout.originX ?? targetLayout.width / 2,
			progress,
		),
		originY: interpolateNumber(
			initialLayout.originY ?? initialLayout.height / 2,
			targetLayout.originY ?? targetLayout.height / 2,
			progress,
		),
		rotation: interpolateNumber(initialLayout.rotation, targetLayout.rotation, progress),
		scale: interpolateNumber(initialLayout.scale, targetLayout.scale, progress),
		width: interpolateNumber(initialLayout.width, targetLayout.width, progress),
		x: interpolateNumber(initialLayout.x, targetLayout.x, progress),
		y: interpolateNumber(initialLayout.y, targetLayout.y, progress),
	};
}

function interpolateSceneObject(
	initialObject: ResolvedSceneObjectState["object"],
	targetObject: ResolvedSceneObjectState["object"],
	progress: number,
): ResolvedSceneObjectState["object"] {
	if (initialObject.type !== targetObject.type) {
		throw new Error("Screen object kinds cannot change during a transition.");
	}
	if (initialObject.type !== "balance" || targetObject.type !== "balance") {
		return targetObject;
	}
	return {
		...targetObject,
		scorePercent: interpolateNumber(initialObject.scorePercent, targetObject.scorePercent, progress),
	};
}

function interpolateNumber(from: number, to: number, progress: number): number {
	return from + (to - from) * progress;
}

function interpolateCssStyle(
	initialStyle: CssStyle,
	targetStyle: CssStyle,
	progress: number,
): CssStyle {
	const style: CssStyle = {};
	for (const property of new Set([...Object.keys(initialStyle), ...Object.keys(targetStyle)])) {
		style[property] = interpolateCssStyleValue(
			initialStyle[property],
			targetStyle[property],
			progress,
		);
	}
	return style;
}

function interpolateCssStyleValue(
	initialValue: CssStyle[string] | undefined,
	targetValue: CssStyle[string] | undefined,
	progress: number,
): CssStyle[string] {
	if (initialValue === undefined || targetValue === undefined) {
		return targetValue ?? initialValue ?? "";
	}
	if (typeof initialValue === "number" && typeof targetValue === "number") {
		return interpolateNumber(initialValue, targetValue, progress);
	}
	const initialNumber = parseCssNumber(initialValue);
	const targetNumber = parseCssNumber(targetValue);
	if (!initialNumber || !targetNumber || initialNumber.unit !== targetNumber.unit) {
		return targetValue;
	}
	return `${interpolateNumber(initialNumber.value, targetNumber.value, progress)}${targetNumber.unit}`;
}

function parseCssNumber(value: CssStyle[string]): { unit: string; value: number } | undefined {
	if (typeof value === "number") {
		return { unit: "", value };
	}
	const match = /^(-?(?:\d+\.?\d*|\.\d+))(.*)$/.exec(value);
	if (!match) {
		return undefined;
	}
	const numericValue = Number(match[1]);
	return Number.isFinite(numericValue)
		? { unit: match[2] ?? "", value: numericValue }
		: undefined;
}
