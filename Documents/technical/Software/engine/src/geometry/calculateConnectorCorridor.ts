export type ConnectorCorridor = {
	bendRun: number
	straightWidth: number
	width: number
};

/**
 * Resolves the three sections of a connector corridor. `bendRun` is the length
 * reserved for each endpoint bend; `straightShare` reserves the center section.
 */
export function calculateConnectorCorridor(args: {
	bendRun: number
	straightShare: number
}): ConnectorCorridor {
	if (!Number.isFinite(args.bendRun) || args.bendRun < 0) {
		throw new RangeError("Connector bend run must be a non-negative finite number.");
	}
	if (!Number.isFinite(args.straightShare) || args.straightShare < 0 || args.straightShare >= 1) {
		throw new RangeError("Connector straight share must be a finite number from 0 (inclusive) to 1 (exclusive).");
	}

	const width = (args.bendRun * 2) / (1 - args.straightShare);
	return {
		bendRun: args.bendRun,
		straightWidth: width * args.straightShare,
		width,
	};
}
