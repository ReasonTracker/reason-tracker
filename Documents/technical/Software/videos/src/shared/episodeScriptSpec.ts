import { z } from "zod";

const authorKeySchema = z.string()
	.regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "Use letters, numbers, underscores, or hyphens, starting with a letter.");
const nonEmptyStringSchema = z.string().trim().min(1);
const secondsSchema = z.number().finite();
const durationSecondsSchema = secondsSchema.nonnegative();

export const claimSideSchema = z.enum(["pro", "con"])
	.transform((side) => side === "pro" ? "pro-main" as const : "con-main" as const);

const actionTimingShape = {
	blocking: z.boolean().optional(),
	durationSeconds: durationSecondsSchema.optional(),
	label: nonEmptyStringSchema.optional(),
	offsetSeconds: secondsSchema.optional(),
};

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
	claims: z.array(newGraphClaimSchema).optional(),
	hideScores: z.boolean().optional(),
	key: authorKeySchema,
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

const cameraObjectsTargetSchema = z.object({
	objects: z.array(nonEmptyStringSchema).min(1),
}).strict();
const cameraComponentTargetSchema = z.object({
	component: authorKeySchema,
}).strict();
const cameraSceneTargetSchema = z.object({
	scene: z.literal(true),
}).strict();
const cameraTargetSchema = z.union([
	cameraObjectsTargetSchema,
	cameraComponentTargetSchema,
	cameraSceneTargetSchema,
]);

const cameraMoveActionSchema = z.object({
	...actionTimingShape,
	target: cameraTargetSchema,
	type: z.literal("camera.move"),
}).strict();

const cameraFollowActionSchema = z.object({
	...actionTimingShape,
	routeFrom: nonEmptyStringSchema,
	type: z.literal("camera.follow"),
}).strict();

const cameraCutActionSchema = z.object({
	...actionTimingShape,
	target: cameraTargetSchema,
	type: z.literal("camera.cut"),
}).strict();

const captionsShowActionSchema = z.object({
	...actionTimingShape,
	durationSeconds: durationSecondsSchema.positive(),
	position: z.literal("center").optional(),
	text: nonEmptyStringSchema,
	type: z.literal("captions.show"),
}).strict();

const mediaShowActionSchema = z.object({
	...actionTimingShape,
	durationSeconds: durationSecondsSchema.positive(),
	layer: z.enum(["front", "back"]).optional(),
	source: z.string().refine(
		(source) => source.startsWith("media/")
			&& source.length > "media/".length
			&& !source.split("/").includes(".."),
		"Use a media path relative to the episode JSON file, such as media/example.png.",
	),
	type: z.literal("media.show"),
}).strict();

const balanceShowActionSchema = z.object({
	...actionTimingShape,
	durationSeconds: durationSecondsSchema.positive(),
	scale: z.number().finite().positive().optional(),
	scorePercent: z.number().finite().min(-100).max(100),
	startScorePercent: z.number().finite().min(-100).max(100).optional(),
	type: z.literal("balance.show"),
	x: z.number().finite().optional(),
	y: z.number().finite().optional(),
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
	cameraFollowActionSchema,
	cameraCutActionSchema,
	captionsShowActionSchema,
	mediaShowActionSchema,
	balanceShowActionSchema,
	waitActionSchema,
]);

const defaultsSchema = z.object({
	"camera.follow": z.object({
		durationSeconds: durationSecondsSchema.positive().optional(),
	}).strict().optional(),
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
	schemaVersion: z.literal(2),
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
export type EpisodeAction = z.infer<typeof episodeActionSchema>;
export type EpisodeScriptSpec = z.infer<typeof episodeScriptSpecSchema>;
export type GraphAddClaimAction = z.infer<typeof graphAddClaimActionSchema>;
export type GraphClaimState = z.infer<typeof graphClaimStateSchema>;
export type GraphCreateAction = z.infer<typeof graphCreateActionSchema>;
export type GraphPatchAction = z.infer<typeof graphPatchActionSchema>;
export type GraphSetAction = z.infer<typeof graphSetActionSchema>;
export type ScoreboardLayout = z.infer<typeof scoreboardSchema>;
