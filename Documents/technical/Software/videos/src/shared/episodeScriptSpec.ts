import { z } from "zod";

const authorKeySchema = z.string()
	.regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "Use letters, numbers, underscores, or hyphens, starting with a letter.");
const nonEmptyStringSchema = z.string().trim().min(1);
const secondsSchema = z.number().finite();
const durationSecondsSchema = secondsSchema.nonnegative();
const anchorSchema = z.enum(["canvas", "camera"]);

const objectLayoutShape = {
	height: z.number().finite().positive(),
	originX: z.number().finite().optional(),
	originY: z.number().finite().optional(),
	rotation: z.number().finite().default(0),
	scale: z.number().finite().positive().default(1),
	width: z.number().finite().positive(),
	x: z.number().finite(),
	y: z.number().finite(),
};
const objectLayoutSchema = z.object(objectLayoutShape).strict();
const objectLayoutUpdateSchema = objectLayoutSchema.partial().refine(
	(layout) => Object.keys(layout).length > 0,
	"Provide at least one layout change.",
);
const mediaLayoutSchema = z.object({
	height: z.number().finite().positive().optional(),
	originX: z.number().finite().optional(),
	originY: z.number().finite().optional(),
	rotation: z.number().finite().default(0),
	scale: z.number().finite().positive().default(1),
	width: z.number().finite().positive().optional(),
	x: z.number().finite(),
	y: z.number().finite(),
}).strict().superRefine((layout, context) => {
	if (layout.width === undefined && layout.height === undefined) {
		context.addIssue({
			code: "custom",
			message: "Provide exactly one media dimension: layout.width or layout.height.",
		});
	}
	if (layout.width !== undefined && layout.height !== undefined) {
		context.addIssue({
			code: "custom",
			message: "Provide only one media dimension: layout.width or layout.height, not both.",
		});
	}
});
const mediaLayoutUpdateSchema = z.object({
	height: z.number().finite().positive().optional(),
	originX: z.number().finite().optional(),
	originY: z.number().finite().optional(),
	rotation: z.number().finite().optional(),
	scale: z.number().finite().positive().optional(),
	width: z.number().finite().positive().optional(),
	x: z.number().finite().optional(),
	y: z.number().finite().optional(),
}).strict().superRefine((layout, context) => {
	if (Object.keys(layout).length === 0) {
		context.addIssue({ code: "custom", message: "Provide at least one media layout change." });
	}
	if (layout.width !== undefined && layout.height !== undefined) {
		context.addIssue({
			code: "custom",
			message: "Provide only one media dimension: layout.width or layout.height, not both.",
		});
	}
});
const graphLayoutSchema = z.object({
	x: z.number().finite(),
	y: z.number().finite(),
}).strict();
const cameraLayoutSchema = z.object({
	height: z.number().finite().positive(),
	width: z.number().finite().positive(),
	x: z.number().finite(),
	y: z.number().finite(),
}).strict();

export const claimSideSchema = z.enum(["pro", "con"])
	.transform((side) => side === "pro" ? "pro-main" as const : "con-main" as const);

const actionTimingShape = {
	blocking: z.boolean().optional(),
	durationSeconds: durationSecondsSchema.optional(),
	label: nonEmptyStringSchema.optional(),
	offsetSeconds: secondsSchema.optional(),
};

const cssStyleValueSchema = z.union([z.string(), z.number().finite()]);
const cssStyleSchema = z.record(z.string(), cssStyleValueSchema).refine(
	(style) => ![
		"bottom",
		"height",
		"left",
		"right",
		"rotate",
		"rotation",
		"scale",
		"top",
		"transformOrigin",
		"width",
	].some((property) => property in style),
	"Use numeric layout fields for object position, size, scale, rotation, and transform origin.",
);
const mediaSourceSchema = z.string().refine(
	(source) => source.startsWith("media/")
		&& source.length > "media/".length
		&& !source.split("/").includes(".."),
	"Use a media path relative to the episode JSON file, such as media/example.png.",
);

const objectAddShape = {
	...actionTimingShape,
	anchor: anchorSchema.default("canvas"),
	durationSeconds: z.literal(0).optional(),
	key: authorKeySchema,
	layout: objectLayoutSchema,
	style: cssStyleSchema.optional(),
};

const objectUpdateShape = {
	...actionTimingShape,
	key: authorKeySchema,
	layout: objectLayoutUpdateSchema.optional(),
	style: cssStyleSchema.optional(),
};

const objectAddBaseSchema = z.object(objectAddShape).strict();
const objectUpdateBaseSchema = z.object(objectUpdateShape).strict();

const confidenceTargetSchema = authorKeySchema;
const relevanceTargetSchema = z.object({
	relevanceOf: authorKeySchema,
}).strict();
const claimTargetSchema = z.union([
	confidenceTargetSchema,
	relevanceTargetSchema,
]);

const graphClaimPresentationShape = {
	showScore: z.boolean().optional(),
	textReveal: z.boolean().optional(),
};

const scoreboardSchema = z.object({
	anchor: anchorSchema.default("camera"),
	height: z.number().finite().positive(),
	numberWidth: z.number().finite().positive(),
	thermometerWidth: z.number().finite().positive(),
	x: z.number().finite(),
	y: z.number().finite(),
}).strict();

const newGraphClaimSchema = z.object({
	key: authorKeySchema,
	side: claimSideSchema,
	target: claimTargetSchema,
	text: nonEmptyStringSchema,
	...graphClaimPresentationShape,
}).strict();

const graphClaimStateSchema = z.object({
	key: authorKeySchema,
	side: claimSideSchema.optional(),
	target: claimTargetSchema.optional(),
	text: nonEmptyStringSchema.optional(),
	...graphClaimPresentationShape,
}).strict();

const graphCreateActionSchema = z.object({
	...actionTimingShape,
	anchor: anchorSchema.default("canvas"),
	claims: z.array(newGraphClaimSchema).optional(),
	hideScores: z.boolean().optional(),
	key: authorKeySchema,
	layout: graphLayoutSchema,
	mainClaim: z.object({
		key: authorKeySchema,
		text: nonEmptyStringSchema,
		...graphClaimPresentationShape,
	}).strict(),
	scoreboard: scoreboardSchema.optional(),
	type: z.literal("graph.create"),
}).strict();

const graphAddClaimActionSchema = z.object({
	...actionTimingShape,
	graph: authorKeySchema,
	key: authorKeySchema,
	side: claimSideSchema,
	target: confidenceTargetSchema,
	text: nonEmptyStringSchema,
	...graphClaimPresentationShape,
	type: z.literal("graph.addClaim"),
}).strict();

const graphSetActionSchema = z.object({
	...actionTimingShape,
	claims: z.array(graphClaimStateSchema).min(1),
	graph: authorKeySchema,
	type: z.literal("graph.set"),
}).strict();

const graphPatchActionSchema = z.object({
	...actionTimingShape,
	claims: z.array(graphClaimStateSchema),
	graph: authorKeySchema,
	removeConnectionsFrom: z.array(authorKeySchema),
	type: z.literal("graph.patch"),
}).strict();

const cameraTargetTimingShape = {
	offsetSeconds: secondsSchema.default(0),
};

const cameraObjectsTargetSchema = z.object({
	...cameraTargetTimingShape,
	objects: z.array(nonEmptyStringSchema).min(1),
	"x%": z.number().finite().optional(),
	"y%": z.number().finite().optional(),
	"zoom%": z.number().finite().positive().optional(),
}).strict();
const cameraLayoutTargetSchema = z.object({
	...cameraTargetTimingShape,
	layout: cameraLayoutSchema,
}).strict();
const cameraTargetSchema = z.union([cameraObjectsTargetSchema, cameraLayoutTargetSchema]);

const cameraMoveActionSchema = z.object({
	...actionTimingShape,
	target: cameraTargetSchema,
	type: z.literal("camera.move"),
}).strict();

const cameraCutActionSchema = z.object({
	...actionTimingShape,
	target: cameraTargetSchema,
	type: z.literal("camera.cut"),
}).strict();

const mediaAddActionSchema = z.object({
	...objectAddShape,
	layout: mediaLayoutSchema,
	source: mediaSourceSchema,
	type: z.literal("media.add"),
}).strict();

const mediaUpdateActionSchema = z.object({
	...objectUpdateShape,
	layout: mediaLayoutUpdateSchema.optional(),
	source: mediaSourceSchema.optional(),
	type: z.literal("media.update"),
}).strict().refine(
	(action) => action.source !== undefined || action.layout !== undefined || Object.keys(action.style ?? {}).length > 0,
	"Provide a source, layout change, or at least one style change.",
);

const balanceAddActionSchema = z.object({
	...objectAddShape,
	scorePercent: z.number().finite().min(-100).max(100),
	type: z.literal("balance.add"),
}).strict();

const balanceUpdateActionSchema = z.object({
	...objectUpdateShape,
	scorePercent: z.number().finite().min(-100).max(100).optional(),
	type: z.literal("balance.update"),
}).strict().refine(
	(action) => action.scorePercent !== undefined || action.layout !== undefined || Object.keys(action.style ?? {}).length > 0,
	"Provide a scorePercent, layout change, or at least one style change.",
);

const captionsShowActionSchema = z.object({
	...actionTimingShape,
	anchor: anchorSchema.default("camera"),
	durationSeconds: durationSecondsSchema.positive(),
	position: z.literal("center").optional(),
	text: nonEmptyStringSchema,
	type: z.literal("captions.show"),
}).strict();

const waitActionSchema = z.object({
	...actionTimingShape,
	durationSeconds: durationSecondsSchema.positive(),
	type: z.literal("wait"),
}).strict();

export const episodeActionSchema = z.discriminatedUnion("type", [
	graphCreateActionSchema,
	graphAddClaimActionSchema,
	graphSetActionSchema,
	graphPatchActionSchema,
	cameraMoveActionSchema,
	cameraCutActionSchema,
	mediaAddActionSchema,
	mediaUpdateActionSchema,
	balanceAddActionSchema,
	balanceUpdateActionSchema,
	captionsShowActionSchema,
	waitActionSchema,
]);

const defaultsSchema = z.object({
	"camera.move": z.object({
		durationSeconds: durationSecondsSchema.positive().optional(),
	}).strict().optional(),
	"graph.addClaim": z.object({
		durationSeconds: durationSecondsSchema.positive().optional(),
	}).strict().optional(),
	"graph.create": z.object({
		durationSeconds: durationSecondsSchema.optional(),
	}).strict().optional(),
}).strict();

export const episodeScriptSpecSchema = z.object({
	schemaVersion: z.literal(3),
	script: z.array(episodeActionSchema).min(1),
	settings: z.object({
		composition: z.object({
			fps: z.number().int().positive(),
			height: z.number().int().positive(),
			id: nonEmptyStringSchema,
			width: z.number().int().positive(),
		}).strict(),
		defaults: defaultsSchema.optional(),
	}).strict(),
}).strict();

export type ClaimSide = z.infer<typeof claimSideSchema>;
export type Anchor = z.infer<typeof anchorSchema>;
export type EpisodeAction = z.infer<typeof episodeActionSchema>;
export type EpisodeScriptSpecInput = z.input<typeof episodeScriptSpecSchema>;
export type EpisodeScriptSpec = z.infer<typeof episodeScriptSpecSchema>;
export type GraphAddClaimAction = z.infer<typeof graphAddClaimActionSchema>;
export type GraphClaimState = z.infer<typeof graphClaimStateSchema>;
export type GraphCreateAction = z.infer<typeof graphCreateActionSchema>;
export type GraphPatchAction = z.infer<typeof graphPatchActionSchema>;
export type GraphSetAction = z.infer<typeof graphSetActionSchema>;
export type CssStyle = z.infer<typeof cssStyleSchema>;
export type GraphLayout = z.infer<typeof graphLayoutSchema>;
export type MediaLayout = z.infer<typeof mediaLayoutSchema>;
export type MediaLayoutUpdate = z.infer<typeof mediaLayoutUpdateSchema>;
export type ObjectLayout = z.infer<typeof objectLayoutSchema>;
export type ObjectAdd = z.infer<typeof objectAddBaseSchema>;
export type ObjectUpdate = z.infer<typeof objectUpdateBaseSchema>;
export type ScoreboardLayout = z.infer<typeof scoreboardSchema>;
