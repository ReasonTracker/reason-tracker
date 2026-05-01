export type DeliveryStackMember<TId extends string, TTargetId extends string> = {
    id: TId;
    sourceCenterY: number;
    stackBottomOffset?: number;
    stackHeight: number;
    stableOrder: number;
    stackTopOffset?: number;
    targetCenterY: number;
    targetId: TTargetId;
};

export type DeliveryStackLayout<TId extends string, TTargetId extends string> = {
    centerYById: ReadonlyMap<TId, number>;
    orderedIdsByTargetId: ReadonlyMap<TTargetId, readonly TId[]>;
};

export function buildDeliveryStackLayout<TId extends string, TTargetId extends string>(
    members: readonly DeliveryStackMember<TId, TTargetId>[],
): DeliveryStackLayout<TId, TTargetId> {
    const centerYById = new Map<TId, number>();
    const orderedIdsByTargetId = new Map<TTargetId, readonly TId[]>();
    const membersByTargetId = new Map<TTargetId, DeliveryStackMember<TId, TTargetId>[]>();

    for (const member of members) {
        const existingMembers = membersByTargetId.get(member.targetId);

        if (existingMembers) {
            existingMembers.push(member);
            continue;
        }

        membersByTargetId.set(member.targetId, [member]);
    }

    for (const [targetId, targetMembers] of membersByTargetId) {
        const orderedMembers = [...targetMembers].sort((left, right) => {
            const verticalDelta = left.sourceCenterY - right.sourceCenterY;

            if (verticalDelta !== 0) {
                return verticalDelta;
            }

            const stableOrderDelta = left.stableOrder - right.stableOrder;

            if (stableOrderDelta !== 0) {
                return stableOrderDelta;
            }

            return String(left.id).localeCompare(String(right.id));
        });
        const targetCenterY = orderedMembers[0]?.targetCenterY ?? 0;
        const totalStackHeight = orderedMembers.reduce(
            (sum, member) => sum + readStackEnvelopeHeight(member),
            0,
        );
        let nextTop = targetCenterY - totalStackHeight / 2;

        orderedIdsByTargetId.set(targetId, orderedMembers.map((member) => member.id));

        for (const member of orderedMembers) {
            const stackEnvelope = resolveStackEnvelope(member);
            centerYById.set(member.id, nextTop - stackEnvelope.topOffset);
            nextTop += stackEnvelope.bottomOffset - stackEnvelope.topOffset;
        }
    }

    return {
        centerYById,
        orderedIdsByTargetId,
    };
}

function normalizeStackHeight(stackHeight: number): number {
    if (!Number.isFinite(stackHeight)) {
        return 0;
    }

    return Math.max(0, stackHeight);
}

function readStackEnvelopeHeight<TId extends string, TTargetId extends string>(
    member: DeliveryStackMember<TId, TTargetId>,
): number {
    const stackEnvelope = resolveStackEnvelope(member);
    return stackEnvelope.bottomOffset - stackEnvelope.topOffset;
}

function resolveStackEnvelope<TId extends string, TTargetId extends string>(
    member: DeliveryStackMember<TId, TTargetId>,
): { bottomOffset: number; topOffset: number } {
    if (
        Number.isFinite(member.stackTopOffset)
        && Number.isFinite(member.stackBottomOffset)
    ) {
        const topOffset = member.stackTopOffset ?? 0;
        const bottomOffset = member.stackBottomOffset ?? 0;

        return topOffset <= bottomOffset
            ? { bottomOffset, topOffset }
            : { bottomOffset: topOffset, topOffset: bottomOffset };
    }

    const stackHeight = normalizeStackHeight(member.stackHeight);

    return {
        bottomOffset: stackHeight / 2,
        topOffset: -(stackHeight / 2),
    };
}