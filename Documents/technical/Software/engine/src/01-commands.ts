import { ClaimDraft } from "./00-entities/Claim.ts";

type AddClaimCommand = {
  type: "claim/add";
  claimDraft: ClaimDraft
  text: string;
  connectToClaimId?: string;
  connectorKind?: "supports" | "rebuts";
};