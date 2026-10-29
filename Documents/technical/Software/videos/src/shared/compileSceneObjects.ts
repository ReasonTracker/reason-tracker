import type {
	CompiledSceneObject,
	CompiledSceneObjectTransition,
	EpisodeMediaAsset,
	ResolvedSceneObjectState,
	ScheduledEpisodeAction,
} from "./compileEpisodeScript";
import type {
	CssStyle,
	EpisodeAction,
	MediaLayout,
	MediaLayoutUpdate,
	ObjectLayout,
} from "./episodeScriptSpec";

const DEFAULT_SCREEN_OBJECT_STYLE: CssStyle = {
	opacity: 1,
};

type SceneObjectAddAction = Extract<EpisodeAction, { type: "media.add" | "balance.add" }>;
type SceneObjectUpdateAction = Extract<EpisodeAction, { type: "media.update" | "balance.update" }>;
type SceneObject =
	| { aspectRatio: number; source: string; type: "media" }
	| { scorePercent: number; type: "balance" };

export function compileSceneObjects(
	actions: readonly ScheduledEpisodeAction[],
	mediaAssets: Readonly<Record<string, EpisodeMediaAsset>>,
): readonly CompiledSceneObject[] {
	type CompilerState = {
		compiled: {
			from: number
			initialState: ResolvedSceneObjectState
			key: string
			transitions: CompiledSceneObjectTransition[]
		}
		lastTransitionEndFrame: number
		state: ResolvedSceneObjectState
	};

	const states = new Map<string, CompilerState>();
	const objectActions = actions
		.filter(isScheduledSceneObjectAction)
		.sort((left, right) => left.from - right.from || left.index - right.index);

	for (const scheduled of objectActions) {
		const action = scheduled.action;
		if (isSceneObjectAddAction(action)) {
			if (states.has(action.key)) {
				throw new Error(`Action ${scheduled.index} creates duplicate object key: ${action.key}`);
			}
			const initialState = createSceneObjectState(action, mediaAssets, scheduled.index);
			states.set(action.key, {
				compiled: {
					from: scheduled.from,
					initialState,
					key: action.key,
					transitions: [],
				},
				lastTransitionEndFrame: scheduled.from,
				state: initialState,
			});
			continue;
		}

		const state = states.get(action.key);
		if (!state) {
			throw new Error(`Action ${scheduled.index} patches unknown object key: ${action.key}`);
		}
		if (scheduled.from < state.lastTransitionEndFrame) {
			throw new Error(
				`Object ${action.key}: action ${scheduled.index} starts before its prior transition ends. Object patches cannot overlap.`,
			);
		}
		const targetState = mergeSceneObjectState(state.state, action, scheduled.index, mediaAssets);
		state.compiled.transitions.push({
			durationInFrames: scheduled.durationInFrames,
			from: scheduled.from,
			initialState: state.state,
			targetState,
		});
		state.lastTransitionEndFrame = scheduled.endFrame;
		state.state = targetState;
	}

	return [...states.values()].map((state) => state.compiled);
}

function isScheduledSceneObjectAction(
	action: ScheduledEpisodeAction,
): action is ScheduledEpisodeAction & { action: SceneObjectAddAction | SceneObjectUpdateAction } {
	return isSceneObjectAddAction(action.action) || isSceneObjectUpdateAction(action.action);
}

function isSceneObjectAddAction(action: EpisodeAction): action is SceneObjectAddAction {
	return action.type === "media.add" || action.type === "balance.add";
}

function isSceneObjectUpdateAction(action: EpisodeAction): action is SceneObjectUpdateAction {
	return action.type === "media.update" || action.type === "balance.update";
}

function createSceneObjectState(
	action: SceneObjectAddAction,
	mediaAssets: Readonly<Record<string, EpisodeMediaAsset>>,
	actionIndex: number,
): ResolvedSceneObjectState {
	const style = { ...DEFAULT_SCREEN_OBJECT_STYLE, ...action.style };
	switch (action.type) {
		case "media.add": {
			const mediaAsset = requireMediaAsset(mediaAssets, action.source, actionIndex);
			return {
				anchor: action.anchor,
				layout: resolveMediaLayout(action.layout, mediaAsset.aspectRatio),
				object: { aspectRatio: mediaAsset.aspectRatio, source: action.source, type: "media" },
				style,
			};
		}
		case "balance.add":
			return { anchor: action.anchor, layout: action.layout, object: { scorePercent: action.scorePercent, type: "balance" }, style };
	}
}

function mergeSceneObjectState(
	state: ResolvedSceneObjectState,
	action: SceneObjectUpdateAction,
	actionIndex: number,
	mediaAssets: Readonly<Record<string, EpisodeMediaAsset>>,
): ResolvedSceneObjectState {
	const object = updateSceneObject(state.object, action, actionIndex, mediaAssets);
	return {
		anchor: state.anchor,
		layout: object.type === "media" && action.type === "media.update"
			? resolveMediaLayout(action.layout, object.aspectRatio, state.layout)
			: { ...state.layout, ...action.layout },
		object,
		style: { ...state.style, ...action.style },
	};
}

function updateSceneObject(
	object: SceneObject,
	action: SceneObjectUpdateAction,
	actionIndex: number,
	mediaAssets: Readonly<Record<string, EpisodeMediaAsset>>,
): SceneObject {
	switch (action.type) {
		case "media.update":
			if (object.type !== "media") {
				throwSceneObjectKindMismatch(actionIndex, object, action);
			}
			if (!action.source) {
				return object;
			}
			const mediaAsset = requireMediaAsset(mediaAssets, action.source, actionIndex);
			return { aspectRatio: mediaAsset.aspectRatio, source: action.source, type: "media" };
		case "balance.update":
			if (object.type !== "balance") {
				throwSceneObjectKindMismatch(actionIndex, object, action);
			}
			return { ...object, scorePercent: action.scorePercent ?? object.scorePercent };
	}
}

function requireMediaAsset(
	mediaAssets: Readonly<Record<string, EpisodeMediaAsset>>,
	source: string,
	actionIndex: number,
): EpisodeMediaAsset {
	const mediaAsset = mediaAssets[source];
	if (!mediaAsset || !Number.isFinite(mediaAsset.aspectRatio) || mediaAsset.aspectRatio <= 0) {
		throw new Error(`Action ${actionIndex} references media source without a valid intrinsic aspect ratio: ${source}`);
	}
	return mediaAsset;
}

function resolveMediaLayout(
	layout: MediaLayout | MediaLayoutUpdate | undefined,
	aspectRatio: number,
	previousLayout?: ObjectLayout,
): ObjectLayout {
	const width = layout?.width ?? (layout?.height === undefined
		? previousLayout?.width
		: layout.height * aspectRatio);
	if (width === undefined) {
		throw new Error("Media layout requires a width or height.");
	}
	const height = layout?.height ?? width / aspectRatio;
	return {
		height,
		originX: layout?.originX ?? previousLayout?.originX ?? width / 2,
		originY: layout?.originY ?? previousLayout?.originY ?? height / 2,
		rotation: layout?.rotation ?? previousLayout?.rotation ?? 0,
		scale: layout?.scale ?? previousLayout?.scale ?? 1,
		width,
		x: layout?.x ?? previousLayout?.x ?? 0,
		y: layout?.y ?? previousLayout?.y ?? 0,
	};
}

function throwSceneObjectKindMismatch(
	actionIndex: number,
	object: SceneObject,
	action: SceneObjectUpdateAction,
): never {
	throw new Error(
		`Action ${actionIndex} updates a ${object.type} object with ${action.type} changes. Object kinds cannot change.`,
	);
}
