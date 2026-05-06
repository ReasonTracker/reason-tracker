import type { TweenBoolean, TweenNumber, TweenNumberBase, TweenPoint } from "@app/utils.ts";
import { interpolate } from "remotion";

export function resolveTweenNumber(value: TweenNumber, stepProgress: number): number {
    if (typeof value === "number") {
        return value;
    }

    const tweenPercent = resolveTweenPercent({
        endPct: readWhenPct(value, "endPct"),
        stepProgress,
        startPct: readWhenPct(value, "startPct"),
    });

    return interpolate(tweenPercent, [0, 1], [value.from, value.to], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });
}

export function resolveTweenBoolean(value: TweenBoolean, stepProgress: number): boolean {
    if (typeof value === "boolean") {
        return value;
    }

    const tweenPercent = resolveTweenPercent({
        endPct: readWhenPct(value, "endPct"),
        stepProgress,
        startPct: readWhenPct(value, "startPct"),
    });
    const numericValue = interpolate(
        tweenPercent,
        [0, 1],
        [value.from ? 0 : 1, value.to ? 1 : 0],
        {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
        },
    );

    return numericValue >= 0.5;
}

export function resolveTweenPoint(point: TweenPoint, stepProgress: number): { x: number; y: number } {
    const tweenPercent = resolveTweenPercent({
        endPct: point.endPct,
        stepProgress,
        startPct: point.startPct,
    });
    const x = getTweenNumberBaseEndpoints(point.x);
    const y = getTweenNumberBaseEndpoints(point.y);

    return {
        x: interpolate(tweenPercent, [0, 1], [x.from, x.to], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
        }),
        y: interpolate(tweenPercent, [0, 1], [y.from, y.to], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
        }),
    };
}

export function resolveTweenPercent(args: {
    endPct?: number;
    startPct?: number;
    stepProgress: number;
}): number {
    const startPct = Number.isFinite(args.startPct) ? args.startPct ?? 0 : 0;
    const endPct = Number.isFinite(args.endPct) ? args.endPct ?? 1 : 1;

    if (startPct === endPct) {
        return args.stepProgress >= endPct ? 1 : 0;
    }

    return interpolate(args.stepProgress, [startPct, endPct], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });
}

function getTweenNumberBaseEndpoints(value: TweenNumberBase): { from: number; to: number } {
    if (typeof value === "number") {
        return {
            from: value,
            to: value,
        };
    }

    return value;
}

function readWhenPct(
    value: { endPct?: number; startPct?: number } | { from: number; to: number },
    key: "endPct" | "startPct",
): number | undefined {
    if (!(key in value)) {
        return undefined;
    }

    const timedValue = value as { endPct?: number; startPct?: number };

    return timedValue[key];
}