import type { AddConfidenceClaimCommand } from "../debate-core/Commands.ts";
import type { ClaimId } from "../debate-core/Claim.ts";
import type { ConfidenceConnector, ConfidenceConnectorId } from "../debate-core/Connector.ts";
import type { DebateCore } from "../debate-core/Debate.ts";
import { newId } from "./newId.ts";

export interface AppliedConfidenceClaimAddCommand {
    debateCore: DebateCore
    claimId: ClaimId
    confidenceConnectorId: ConfidenceConnectorId
}

export function applyConfidenceClaimAddCommand(args: {
    debateCore: DebateCore;
    command: AddConfidenceClaimCommand;
    when?: Date;
}): AppliedConfidenceClaimAddCommand {
    const claimId = args.command.claim.id ?? newId<ClaimId>(args.when);
    const confidenceConnectorId = args.command.connector.id ?? newId<ConfidenceConnectorId>(args.when);
    const targetClaim = args.debateCore.claims[args.command.connector.targetClaimId];

    if (!targetClaim) {
        throw new Error(`Cannot add confidence claim to missing target claim: ${args.command.connector.targetClaimId}`);
    }

    if (args.debateCore.claims[claimId]) {
        throw new Error(`Cannot add claim with duplicate id: ${claimId}`);
    }

    if (args.debateCore.connectors[confidenceConnectorId]) {
        throw new Error(`Cannot add confidence connector with duplicate id: ${confidenceConnectorId}`);
    }

    const connector: ConfidenceConnector = {
        ...args.command.connector,
        id: confidenceConnectorId,
        source: claimId,
    };

    return {
        debateCore: {
            ...args.debateCore,
            claims: {
                ...args.debateCore.claims,
                [claimId]: {
                    ...args.command.claim,
                    id: claimId,
                },
            },
            connectors: {
                ...args.debateCore.connectors,
                [confidenceConnectorId]: connector,
            },
        },
        claimId,
        confidenceConnectorId,
    };
}