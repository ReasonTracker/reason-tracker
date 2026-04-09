import type { ClaimId, Connector, Debate } from "@reasontracker/contracts";

export interface ConnectorIndexes {
    bySource: Record<string, Connector[]>;
    byTarget: Record<string, Connector[]>;
}

export function createConnectorsIndexes(debate: Debate): ConnectorIndexes {
    const connectorsIndexes: ConnectorIndexes = {
        bySource: {},
        byTarget: {},
    };

    Object.values(debate.connectors).forEach((connector) => {
        (connectorsIndexes.byTarget[connector.target] ??= []).push(connector);
        (connectorsIndexes.bySource[connector.source] ??= []).push(connector);
    });

    return connectorsIndexes;
}

export function getAllClaimIds(debate: Debate): ClaimId[] {
    return Object.keys(debate.claims) as ClaimId[];
}
