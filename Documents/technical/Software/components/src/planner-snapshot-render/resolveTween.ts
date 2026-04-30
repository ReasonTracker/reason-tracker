type TweenNumberLike = number | {
    type: "tween/number";
    from: number;
    to: number;
};

type TweenBooleanLike = boolean | {
    type: "tween/boolean";
    from: boolean;
    to: boolean;
};

type TweenPointLike = {
    x: TweenNumberLike;
    y: TweenNumberLike;
};

export function clamp01(value: number): number {
    return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function getTweenNumberEndpoints(value: TweenNumberLike): { from: number; to: number } {
    if (typeof value === "number") {
        return {
            from: value,
            to: value,
        };
    }

    return value;
}

export function getTweenPointEndpoints(point: TweenPointLike): {
    from: { x: number; y: number };
    to: { x: number; y: number };
} {
    const x = getTweenNumberEndpoints(point.x);
    const y = getTweenNumberEndpoints(point.y);

    return {
        from: {
            x: x.from,
            y: y.from,
        },
        to: {
            x: x.to,
            y: y.to,
        },
    };
}

export function resolveTweenNumber(value: TweenNumberLike, percent: number): number {
    const endpoints = getTweenNumberEndpoints(value);
    return endpoints.from + ((endpoints.to - endpoints.from) * clamp01(percent));
}

export function resolveTweenBoolean(value: TweenBooleanLike, percent: number): boolean {
    if (typeof value === "boolean") {
        return value;
    }

    return clamp01(percent) < 0.5 ? value.from : value.to;
}

export function resolveTweenPoint(point: TweenPointLike, percent: number): { x: number; y: number } {
    return {
        x: resolveTweenNumber(point.x, percent),
        y: resolveTweenNumber(point.y, percent),
    };
}

export function resolveTweenBooleanOpacity(value: TweenBooleanLike, percent: number): number {
    if (typeof value === "boolean") {
        return value ? 1 : 0;
    }

    if (value.from === value.to) {
        return value.to ? 1 : 0;
    }

    return value.from ? 1 - clamp01(percent) : clamp01(percent);
}

export function resolvePresenceOpacity(value: TweenNumberLike, percent: number): number {
    const endpoints = getTweenNumberEndpoints(value);

    if (endpoints.from === endpoints.to) {
        return endpoints.to > 0 ? 1 : 0;
    }

    if (endpoints.from <= 0 && endpoints.to > 0) {
        return clamp01(percent);
    }

    if (endpoints.from > 0 && endpoints.to <= 0) {
        return 1 - clamp01(percent);
    }

    return 1;
}