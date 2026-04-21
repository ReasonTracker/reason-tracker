export type { EngineCommand } from "./01--Commands.ts";
export type {
	AddClaimCommand,
	CreateConnectorCommand,
	CreateDebateCommand,
	DeleteClaimCommand,
	DeleteConnectorCommand,
	UpdateClaimCommand,
	UpdateDebateCommand,
} from "./01--Commands.ts";

export type { Claim, ClaimId } from "./00-entities/Claim.ts";
export type { Side } from "./00-entities/Score.ts";
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
