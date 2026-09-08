import { z } from "zod";

const authorKeySchema = z.string()
	.regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "Use letters, numbers, underscores, or hyphens, starting with a letter.");
const nonEmptyStringSchema = z.string().trim().min(1);
const secondsSchema = z.number().finite();
const durationSecondsSchema = secondsSchema.nonnegative();

export const claimSideSchema = z.enum(["pro-main", "con-main"]);

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

const newGraphClaimSchema = z.object({
	key: authorKeySchema,
	side: claimSideSchema,
	target: claimTargetSchema,
	text: nonEmptyStringSchema,
	textReveal: z.literal(true).optional(),
}).strict();

const graphClaimStateSchema = z.object({
	key: authorKeySchema,
	side: claimSideSchema.optional(),
	target: claimTargetSchema.optional(),
	text: nonEmptyStringSchema.optional(),
	textReveal: z.literal(true).optional(),
}).strict();

const graphCreateActionSchema = z.object({
	...actionTimingShape,
	claims: z.array(newGraphClaimSchema).optional(),
	key: authorKeySchema,
	mainClaim: z.object({
		key: authorKeySchema,
		text: nonEmptyStringSchema,
		textReveal: z.literal(true).optional(),
	}).strict(),
	type: z.literal("graph.create"),
}).strict();

const graphAddClaimActionSchema = z.object({
	...actionTimingShape,
	graph: authorKeySchema,
	key: authorKeySchema,
	side: claimSideSchema,
	target: confidenceTargetSchema,
	text: nonEmptyStringSchema,
	textReveal: z.literal(true).optional(),
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

export const episodeActionSchema = z.discriminatedUnion("type", [
	graphCreateActionSchema,
	graphAddClaimActionSchema,
	graphSetActionSchema,
	graphPatchActionSchema,
	cameraMoveActionSchema,
	cameraFollowActionSchema,
	cameraCutActionSchema,
	captionsShowActionSchema,
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
