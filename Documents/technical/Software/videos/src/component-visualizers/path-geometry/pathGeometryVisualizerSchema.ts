import { z } from "zod";

const pipeWidthSchema = z.number().min(1).step(1);

const offsetsSectionSchema = z.object({
	type: z.literal("offsets"),
	offsetA: z.number(),
	offsetB: z.number(),
});

const linearExtremitySchema = z.object({
	kind: z.literal("linear"),
	startPositionPercent: z.number().min(0).max(100),
	lengthPx: z.number().min(0).step(1),
	collapseOffset: z.number(),
});

const curvedExtremitySchema = z.object({
	kind: z.literal("curved"),
	startPositionPercent: z.number().min(0).max(100),
	lengthPx: z.number().min(0).step(1),
	collapseOffset: z.number(),
});

const openExtremitySchema = z.object({
	kind: z.literal("open"),
	startPositionPercent: z.number().min(0).max(100),
});

const extremityEditorSchema = z.discriminatedUnion("kind", [
	openExtremitySchema,
	curvedExtremitySchema,
	linearExtremitySchema,
]);

const transitionStepSchema = z.object({
	type: z.literal("transition"),
	startPositionPercent: z.number().min(0).max(100),
	lengthPx: z.number().min(0).step(1),
	kind: z.enum(["curved", "linear"]),
});

export const pathGeometryVisualizerSchema = z.object({
	pipeWidth: pipeWidthSchema,
	fluidLeadingExtremity: extremityEditorSchema,
	fluidSections: z.array(
		z.discriminatedUnion("type", [offsetsSectionSchema, transitionStepSchema]),
	).min(1),
	fluidTrailingExtremity: extremityEditorSchema,
});

export type PathGeometryVisualizerProps = z.infer<
	typeof pathGeometryVisualizerSchema
>;
