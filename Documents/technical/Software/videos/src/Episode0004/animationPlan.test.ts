import { DebateGraph, resolveDebateSceneGeometry } from "@reasontracker/components";
import { resolveAnimationFrame } from "@planner/DebateAnimationPlan.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	episode0004AnimationPlan,
	episode0004DebateCore,
} from "./animationPlan";

describe("Episode0004 animation plan", () => {
	it("resolves finite key frames without geometry errors", () => {
		const frames = [
			episode0004AnimationPlan.openingFrame,
			...(["voila", "sprout", "firstFill"] as const).flatMap((stepId) => [
				resolveAnimationFrame(episode0004AnimationPlan, stepId, 0.5),
				resolveAnimationFrame(episode0004AnimationPlan, stepId, 1),
			]),
		];

		for (const frame of frames) {
			for (const claim of Object.values(frame.claims)) {
				expect([
					claim.position.x,
					claim.position.y,
					claim.scale,
					claim.sourcesScale,
					claim.score,
				]).toSatisfy((values: number[]) => values.every(Number.isFinite));
			}

			const geometry = resolveDebateSceneGeometry({
				frame,
				options: episode0004AnimationPlan.options,
			});
			const geometryErrors = geometry.bands.flatMap((band) =>
				band.diagnosticIssues.filter((issue) => issue.severity === "error"),
			);

			expect(geometryErrors).toEqual([]);
		}

		for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
			const frame = resolveAnimationFrame(episode0004AnimationPlan, "voila", progress);
			expect(resolveOverlappingClaimPairs(frame)).toEqual([]);
		}

		const sproutStart = resolveAnimationFrame(episode0004AnimationPlan, "sprout", 0);
		const sproutEnd = resolveAnimationFrame(episode0004AnimationPlan, "sprout", 1);
		const newConnectionAtStart = Object.values(sproutStart.confidenceConnections)
			.find((connection) => connection.shellReveal === 0 && connection.score === 0);
		const newConnectionAtEnd = newConnectionAtStart
			? sproutEnd.confidenceConnections[newConnectionAtStart.id]
			: undefined;

		expect(newConnectionAtStart).toBeDefined();
		expect(newConnectionAtStart?.sourceScale).toBe(newConnectionAtEnd?.sourceScale);
		expect(newConnectionAtStart?.deliveryScale).toBe(newConnectionAtEnd?.deliveryScale);
		expect(newConnectionAtEnd?.shellReveal).toBe(1);

		const finalFrame = frames.at(-1);
		expect(finalFrame).toBeDefined();
		const markup = renderToStaticMarkup(createElement(DebateGraph, {
			bounds: episode0004AnimationPlan.bounds,
			debateCore: episode0004DebateCore,
			frame: finalFrame ?? episode0004AnimationPlan.openingFrame,
			options: episode0004AnimationPlan.options,
		}));

		expect(markup).toContain("<svg");
		expect(markup).toContain("data-layer=\"connectors\"");
		expect(markup).toContain("data-layer=\"claims\"");
	});
});

function resolveOverlappingClaimPairs(
	frame: ReturnType<typeof resolveAnimationFrame>,
): string[] {
	const claims = Object.values(frame.claims).filter((claim) => claim.scale > 1e-6);
	const overlaps: string[] = [];

	for (let leftIndex = 0; leftIndex < claims.length; leftIndex += 1) {
		for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex += 1) {
			const left = claims[leftIndex];
			const right = claims[rightIndex];
			if (!left || !right) {
				continue;
			}

			const horizontalOverlap = Math.abs(left.position.x - right.position.x)
				< (episode0004AnimationPlan.options.claimWidth * (left.scale + right.scale)) / 2;
			const verticalOverlap = Math.abs(left.position.y - right.position.y)
				< (episode0004AnimationPlan.options.claimHeight * (left.scale + right.scale)) / 2;
			if (horizontalOverlap && verticalOverlap) {
				overlaps.push(`${left.id} overlaps ${right.id}`);
			}
		}
	}

	return overlaps;
}