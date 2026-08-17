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
 * An OTC print counts as a market price like any other trade, so it also moves
 * the asset's `last_price` — the book's Last column and everyone's
 * mark-to-market follow it. Only the order book itself stays untouched: no
 * resting order is created or consumed.
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

		// Treat the print as a market price change: the book's Last column and
		// mark-to-market P&L both track it. Not fatal if it fails — the positions
		// view marks off the most recent trade regardless.
		const { error: assetError } = await supabase
			.from('assets')
			.update({ last_price: proposal.price })
			.eq('id', proposal.asset_id);

		if (assetError) console.error('Failed to update last price after OTC trade:', assetError);

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
