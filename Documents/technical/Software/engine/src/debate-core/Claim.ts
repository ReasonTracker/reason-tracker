import type { PatchWithRequiredId } from "../typeUtils.ts";
import type { CreateWithOptionalId } from "../typeUtils.ts";

export interface Claim {
	id: ClaimId
	content: string
	reversible?: boolean
	reversedContent?: string

	/** Optional starting confidence, used only while this claim has no child claims. */
	defaultConfidence?: number

	/** Optional starting relevance, used only while this claim has no child claims. */
	defaultRelevance?: number
}

export type ClaimCreate = CreateWithOptionalId<Claim>;
export type ClaimPatch = PatchWithRequiredId<Claim>;

export type ClaimId = string & { readonly __brand: "ClaimId" };
