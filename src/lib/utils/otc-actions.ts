import { supabase } from '$lib/supabase';
import type { OtcProposal, Trade } from '$lib/types/database';
import { acceptorSide, tradeParties, OtcError } from './otc';

/** Supabase-backed OTC operations. Pure helpers live in `otc.ts`. */

/**
 * Accept a pending proposal and print the resulting trade.
 *
 * The proposal row is claimed first with a conditional update (status must still
 * be 'pending'), so a proposal that was cancelled or already resolved in the
 * meantime can't be double-executed. The trade itself needs order rows to point
 * at, so a pair of already-filled orders is written for the two sides — they
 * never appear in the book (every book/blotter query filters on status='open')
 * but they keep the `positions` view and settlement math working unchanged.
 *
 * The asset's `last_price` is deliberately left alone: an OTC print is
 * negotiated privately and shouldn't move everyone's mark-to-market.
 */
export async function acceptProposal(proposal: OtcProposal, acceptingParticipantId: string): Promise<Trade> {
	if (proposal.counterparty_id !== acceptingParticipantId) {
		throw new OtcError('Only the counterparty can accept this proposal');
	}

	// Claim the proposal so a concurrent cancel/decline can't race the trade.
	const { data: claimed, error: claimError } = await supabase
		.from('otc_proposals')
		.update({ status: 'accepted', resolved_at: new Date().toISOString() })
		.eq('id', proposal.id)
		.eq('status', 'pending')
		.select()
		.maybeSingle();

	if (claimError) throw claimError;
	if (!claimed) throw new OtcError('This proposal is no longer available');

	try {
		const { buyerId, sellerId } = tradeParties(proposal);

		const { data: orders, error: orderError } = await supabase
			.from('orders')
			.insert([
				{
					asset_id: proposal.asset_id,
					participant_id: buyerId,
					side: 'buy',
					price: proposal.price,
					size: proposal.size,
					remaining_size: 0,
					status: 'filled'
				},
				{
					asset_id: proposal.asset_id,
					participant_id: sellerId,
					side: 'sell',
					price: proposal.price,
					size: proposal.size,
					remaining_size: 0,
					status: 'filled'
				}
			])
			.select();

		if (orderError) throw orderError;

		const buyOrder = orders?.find((o) => o.side === 'buy');
		const sellOrder = orders?.find((o) => o.side === 'sell');
		if (!buyOrder || !sellOrder) throw new OtcError('Failed to record the OTC trade legs');

		const { data: trade, error: tradeError } = await supabase
			.from('trades')
			.insert({
				asset_id: proposal.asset_id,
				buy_order_id: buyOrder.id,
				sell_order_id: sellOrder.id,
				buyer_id: buyerId,
				seller_id: sellerId,
				price: proposal.price,
				size: proposal.size,
				taker_side: acceptorSide(proposal.side),
				is_otc: true
			})
			.select()
			.single();

		if (tradeError) throw tradeError;

		await supabase.from('otc_proposals').update({ trade_id: trade.id }).eq('id', proposal.id);

		return trade as Trade;
	} catch (e) {
		// Roll the claim back so the proposal stays actionable if the print failed.
		await supabase
			.from('otc_proposals')
			.update({ status: 'pending', resolved_at: null })
			.eq('id', proposal.id)
			.eq('status', 'accepted');
		throw e;
	}
}
