import type { Bounds } from "./renderTypes";

export function boundsFromCenteredRect(
    centerX: number,
    centerY: number,
    width: number,
    height: number,
): Bounds {
    return {
        minX: centerX - width / 2,
        minY: centerY - height / 2,
        maxX: centerX + width / 2,
        maxY: centerY + height / 2,
    };
}

export function boundsFromPoints(points: ReadonlyArray<{ x: number; y: number }>, padding = 0): Bounds | undefined {
    if (points.length < 1) {
        return undefined;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }

    return {
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding,
    };
}

export function mergeBounds(current: Bounds | undefined, next: Bounds | undefined): Bounds | undefined {
    if (!next) {
        return current;
    }

    if (!current) {
        return next;
    }

    return {
        minX: Math.min(current.minX, next.minX),
        minY: Math.min(current.minY, next.minY),
        maxX: Math.max(current.maxX, next.maxX),
        maxY: Math.max(current.maxY, next.maxY),
    };
}