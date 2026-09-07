import { describe, expect, it } from "vitest";
import type { PathGeometry, PathGeometryCommand } from "./buildPathGeometry";
import { buildPathVolumeGeometry } from "./buildPathVolumeGeometry";

const route = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];

describe("buildPathVolumeGeometry", () => {
	it("derives a decreasing transition from final width at the source to initial width at the target", () => {
		const [geometry] = buildPathVolumeGeometry({
			placement: "positiveEdge",
			points: route,
			shellWidth: 100,
			stableValue: 0.25,
			transitions: [{ finalValue: 0.25, initialValue: 1, progress: 0.5 }],
		});

		expect(geometry).toBeDefined();
		expect(resolveEndpointWidth(geometry, "start")).toBeCloseTo(25);
		expect(resolveEndpointWidth(geometry, "end")).toBeCloseTo(100);
	});

	it("derives the correct extremity for transitions to and from zero", () => {
		const [decreasing] = buildPathVolumeGeometry({
			placement: "positiveEdge",
			points: route,
			shellWidth: 100,
			stableValue: 0,
			transitions: [{ finalValue: 0, initialValue: 1, progress: 0.5 }],
		});
		const [increasing] = buildPathVolumeGeometry({
			placement: "positiveEdge",
			points: route,
			shellWidth: 100,
			stableValue: 1,
			transitions: [{ finalValue: 1, initialValue: 0, progress: 0.5 }],
		});

		expect(firstPoint(decreasing).x).toBeGreaterThan(0);
		expect(lastPoint(decreasing).x).toBeCloseTo(1000);
		expect(firstPoint(increasing).x).toBeCloseTo(0);
		expect(lastPoint(increasing).x).toBeLessThan(1000);
		expect(lastPoint(increasing).y).toBeCloseTo(50);

		const [leftwardFill] = buildPathVolumeGeometry({
			placement: "negativeEdge",
			points: [...route].reverse(),
			shellWidth: 100,
			stableValue: 1,
			transitions: [{ finalValue: 1, initialValue: 0, progress: 0.5 }],
		});
		expect(lastPoint(leftwardFill).y).toBeCloseTo(50);
	});

	it("keeps simultaneous volumes separated by a zero-valued section", () => {
		const geometries = buildPathVolumeGeometry({
			placement: "positiveEdge",
			points: route,
			shellWidth: 100,
			stableValue: 1,
			transitions: [
				{ finalValue: 1, initialValue: 0, progress: 0.25 },
				{ finalValue: 0, initialValue: 0.6, progress: 0.75 },
			],
		});

		expect(geometries).toHaveLength(2);
		expect(lastPoint(geometries[0]).x).toBeLessThan(firstPoint(geometries[1]).x);
	});
});

function resolveEndpointWidth(
	geometry: PathGeometry | undefined,
	endpoint: "start" | "end",
): number {
	const boundaryAPoint = endpoint === "start"
		? firstPointFromCommands(geometry?.boundaryAPathCommands)
		: lastPointFromCommands(geometry?.boundaryAPathCommands);
	const boundaryBPoint = endpoint === "start"
		? firstPointFromCommands(geometry?.boundaryBPathCommands)
		: lastPointFromCommands(geometry?.boundaryBPathCommands);

	return Math.hypot(
		boundaryAPoint.x - boundaryBPoint.x,
		boundaryAPoint.y - boundaryBPoint.y,
	);
}

function firstPoint(geometry: PathGeometry | undefined): { x: number; y: number } {
	return firstPointFromCommands(geometry?.boundaryAPathCommands);
}

function lastPoint(geometry: PathGeometry | undefined): { x: number; y: number } {
	return lastPointFromCommands(geometry?.boundaryAPathCommands);
}

function firstPointFromCommands(
	commands: PathGeometryCommand[] | undefined,
): { x: number; y: number } {
	const command = commands?.[0];
	if (!command) {
		throw new Error("Expected path geometry commands.");
	}
	return { x: command.x, y: command.y };
}

function lastPointFromCommands(
	commands: PathGeometryCommand[] | undefined,
): { x: number; y: number } {
	const command = commands?.at(-1);
	if (!command) {
		throw new Error("Expected path geometry commands.");
	}
	return { x: command.x, y: command.y };
}