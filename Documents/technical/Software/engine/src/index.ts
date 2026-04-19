export type { EngineCommand } from "./00-commands.ts";
export type {
	AddClaimCommand,
	ConnectClaimToClaimCommand,
	ConnectClaimToConnectorCommand,
	DeleteClaimCommand,
	DeleteConnectorCommand,
	SetMainClaimCommand,
	UpdateClaimCommand,
	UpdateDebateCommand,
} from "./00-commands.ts";
export type { Claim, ClaimId, Side } from "./00-entities/Claim.ts";
export type {
	Affects,
	ClaimToClaimConnector,
	ClaimToConnectorConnector,
	Connector,
	ConnectorCreate,
	ConnectorId,
	TargetRelation,
} from "./00-entities/Connector.ts";
export type { Debate, DebateId } from "./00-entities/Debate.ts";
export type { Score, ScoreId } from "./00-entities/Score.ts";
