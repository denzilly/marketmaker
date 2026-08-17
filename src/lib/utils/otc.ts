import type { OrderSide, OtcProposal } from '$lib/types/database';

/**
 * OTC (over-the-counter) trading: bilateral proposals sent straight to another
 * participant instead of resting in the central order book. A proposal's `side`
 * is always from the proposer's perspective — 'buy' means the proposer wants to
 * buy the asset from the counterparty.
 *
 * Pure helpers only, so they stay unit-testable; the Supabase calls live in
 * `otc-actions.ts` (same split as `matching-engine.ts` / `order-matching.ts`).
 */

export interface ProposalDraft {
	assetId: string;
	counterpartyId: string;
	side: OrderSide;
	price: string;
	size: string;
}

export interface ValidatedProposal {
	price: number;
	size: number;
}

/**
 * Validate a draft proposal. Mirrors order-entry rules: price is any number
 * (negatives allowed, max 1 decimal place), size is a positive integer.
 * Returns either the parsed values or a human-readable error.
 */
export function validateProposal(draft: ProposalDraft): { ok: true; value: ValidatedProposal } | { ok: false; error: string } {
	if (!draft.assetId) return { ok: false, error: 'Pick an asset' };
	if (!draft.counterpartyId) return { ok: false, error: 'Pick a counterparty' };

	if (draft.price === '' || draft.price === null) return { ok: false, error: 'Enter a price' };
	const price = parseFloat(draft.price);
	if (isNaN(price)) return { ok: false, error: 'Price must be a number' };
	const decimals = String(price).split('.')[1];
	if (decimals && decimals.length > 1) return { ok: false, error: 'Price: max 1 decimal place' };

	if (draft.size === '' || draft.size === null) return { ok: false, error: 'Enter a size' };
	const size = parseInt(draft.size, 10);
	if (isNaN(size) || size <= 0) return { ok: false, error: 'Size must be a positive integer' };

	return { ok: true, value: { price, size } };
}

/** Who buys and who sells, given a proposal's side (proposer's perspective). */
export function tradeParties(proposal: Pick<OtcProposal, 'side' | 'proposer_id' | 'counterparty_id'>): {
	buyerId: string;
	sellerId: string;
} {
	return proposal.side === 'buy'
		? { buyerId: proposal.proposer_id, sellerId: proposal.counterparty_id }
		: { buyerId: proposal.counterparty_id, sellerId: proposal.proposer_id };
}

/**
 * The accepting party is the aggressor — they took the deal on the table — so
 * the printed trade's taker_side is the side opposite the proposer's.
 */
export function acceptorSide(side: OrderSide): OrderSide {
	return side === 'buy' ? 'sell' : 'buy';
}

/** "You buy 5 WIDGET @ 12 from Anna" — as seen by the proposer. */
export function describeOutgoing(
	side: OrderSide,
	size: number,
	assetName: string,
	price: number,
	counterpartyName: string
): string {
	return side === 'buy'
		? `You buy ${size} ${assetName} @ ${price} from ${counterpartyName}`
		: `You sell ${size} ${assetName} @ ${price} to ${counterpartyName}`;
}

/** "Anna wants to buy 5 WIDGET @ 12 from you" — as seen by the counterparty. */
export function describeIncoming(
	side: OrderSide,
	size: number,
	assetName: string,
	price: number,
	proposerName: string
): string {
	return side === 'buy'
		? `${proposerName} wants to buy ${size} ${assetName} @ ${price} from you`
		: `${proposerName} wants to sell you ${size} ${assetName} @ ${price}`;
}

/** What the counterparty does if they accept: the mirror of the proposer's side. */
export function incomingActionLabel(side: OrderSide): string {
	return side === 'buy' ? 'You sell' : 'You buy';
}

export function formatOtcTradeMessage(
	buyerName: string,
	sellerName: string,
	size: number,
	assetName: string,
	price: number
): string {
	return `${buyerName} bought ${size} ${assetName} from ${sellerName} @ ${price} (OTC)`;
}

/** A proposal was edited after it was sent (the receiver sees an "amended" tag). */
export function wasAmended(proposal: Pick<OtcProposal, 'created_at' | 'updated_at'>): boolean {
	return new Date(proposal.updated_at).getTime() - new Date(proposal.created_at).getTime() > 1000;
}

export function isPendingIncoming(proposal: OtcProposal, participantId: string): boolean {
	return proposal.status === 'pending' && proposal.counterparty_id === participantId;
}

export function isPendingOutgoing(proposal: OtcProposal, participantId: string): boolean {
	return proposal.status === 'pending' && proposal.proposer_id === participantId;
}

/** Proposals this participant is a party to, newest first. */
export function involves(proposal: OtcProposal, participantId: string): boolean {
	return proposal.proposer_id === participantId || proposal.counterparty_id === participantId;
}

export class OtcError extends Error {}
