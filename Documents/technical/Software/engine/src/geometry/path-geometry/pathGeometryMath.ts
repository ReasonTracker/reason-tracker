import type { Point } from "../Point.ts";

export function addPoint(a: Point, b: Point): Point {
	return { x: a.x + b.x, y: a.y + b.y };
}

export function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function clampNumber(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}

export function crossProduct(a: Point, b: Point): number {
	return a.x * b.y - a.y * b.x;
}

export function distanceBetweenPoints(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

export function dotProduct(a: Point, b: Point): number {
	return a.x * b.x + a.y * b.y;
}

export function estimateRouteLength(points: readonly Point[]): number {
	let length = 0;
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1];
		const current = points[index];
		if (previous && current) {
			length += distanceBetweenPoints(previous, current);
		}
	}

	return length;
}

export function interpolateNumber(a: number, b: number, interpolation: number): number {
	return a + (b - a) * interpolation;
}

export function interpolatePoint(a: Point, b: Point, interpolation: number): Point {
	return {
		x: interpolateNumber(a.x, b.x, interpolation),
		y: interpolateNumber(a.y, b.y, interpolation),
	};
}

export function leftNormal(point: Point): Point {
	return { x: -point.y, y: point.x };
}

export function lengthOfPoint(point: Point): number {
	return Math.hypot(point.x, point.y);
}

export function normalizePoint(point: Point, minimumLength: number): Point | undefined {
	const length = lengthOfPoint(point);
	if (length <= minimumLength) {
		return undefined;
	}

	return { x: point.x / length, y: point.y / length };
}

export function pointsEqual(a: Point, b: Point, tolerance: number): boolean {
	return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

export function rightNormal(point: Point): Point {
	return { x: point.y, y: -point.x };
}

export function scalePoint(point: Point, scalar: number): Point {
	return { x: point.x * scalar, y: point.y * scalar };
}

export function subtractPoint(a: Point, b: Point): Point {
	return { x: a.x - b.x, y: a.y - b.y };
}
