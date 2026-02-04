import { supabase } from '$lib/supabase';
import type { Order, Trade } from '$lib/types/database';

interface MatchResult {
	trades: Trade[];
	updatedOrders: Order[];
	remainingSize: number;
}

/**
 * Attempt to match an incoming order against existing orders.
 * Uses price-time priority (FIFO).
 *
 * @param incomingOrder - The new order to match
 * @param existingOrders - All open orders for the same asset
 * @returns Trades executed and orders updated
 */
export async function matchOrder(
	incomingOrder: Order,
	existingOrders: Order[]
): Promise<MatchResult> {
	const trades: Trade[] = [];
	const updatedOrders: Order[] = [];
	let remainingSize = incomingOrder.remaining_size;

	// Filter to opposite side orders that cross
	const oppositeOrders = existingOrders
		.filter((o) => {
			if (o.status !== 'open' || o.remaining_size <= 0) return false;
			if (o.participant_id === incomingOrder.participant_id) return false; // Can't trade with yourself

			if (incomingOrder.side === 'buy') {
				// Buy order matches sells at price <= buy price
				return o.side === 'sell' && o.price <= incomingOrder.price;
			} else {
				// Sell order matches buys at price >= sell price
				return o.side === 'buy' && o.price >= incomingOrder.price;
			}
		})
		// Sort by price (best first), then by time (oldest first)
		.sort((a, b) => {
			if (incomingOrder.side === 'buy') {
				// For buys, best sell is lowest price
				if (a.price !== b.price) return a.price - b.price;
			} else {
				// For sells, best buy is highest price
				if (a.price !== b.price) return b.price - a.price;
			}
			// Same price: oldest first (FIFO)
			return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
		});

	// Match against each order until filled
	for (const restingOrder of oppositeOrders) {
		if (remainingSize <= 0) break;

		const fillSize = Math.min(remainingSize, restingOrder.remaining_size);
		const tradePrice = restingOrder.price; // Execute at resting order's price

		// Determine buyer and seller
		const buyerId = incomingOrder.side === 'buy' ? incomingOrder.participant_id : restingOrder.participant_id;
		const sellerId = incomingOrder.side === 'sell' ? incomingOrder.participant_id : restingOrder.participant_id;
		const buyOrderId = incomingOrder.side === 'buy' ? incomingOrder.id : restingOrder.id;
		const sellOrderId = incomingOrder.side === 'sell' ? incomingOrder.id : restingOrder.id;

		// Create trade
		const { data: trade, error: tradeError } = await supabase
			.from('trades')
			.insert({
				asset_id: incomingOrder.asset_id,
				buy_order_id: buyOrderId,
				sell_order_id: sellOrderId,
				buyer_id: buyerId,
				seller_id: sellerId,
				price: tradePrice,
				size: fillSize
			})
			.select()
			.single();

		if (tradeError) {
			console.error('Failed to create trade:', tradeError);
			break;
		}

		trades.push(trade as Trade);

		// Update resting order
		const newRestingSize = restingOrder.remaining_size - fillSize;
		const restingStatus = newRestingSize === 0 ? 'filled' : 'open';

		const { data: updatedResting, error: restingError } = await supabase
			.from('orders')
			.update({
				remaining_size: newRestingSize,
				status: restingStatus
			})
			.eq('id', restingOrder.id)
			.select()
			.single();

		if (!restingError && updatedResting) {
			updatedOrders.push(updatedResting as Order);
		}

		remainingSize -= fillSize;
	}

	// Update incoming order if any fills occurred
	if (remainingSize !== incomingOrder.remaining_size) {
		const incomingStatus = remainingSize === 0 ? 'filled' : 'open';

		const { data: updatedIncoming, error: incomingError } = await supabase
			.from('orders')
			.update({
				remaining_size: remainingSize,
				status: incomingStatus
			})
			.eq('id', incomingOrder.id)
			.select()
			.single();

		if (!incomingError && updatedIncoming) {
			updatedOrders.push(updatedIncoming as Order);
		}
	}

	// Update last_price on asset if any trades occurred
	if (trades.length > 0) {
		const lastTrade = trades[trades.length - 1];
		await supabase
			.from('assets')
			.update({ last_price: lastTrade.price })
			.eq('id', incomingOrder.asset_id);
	}

	return { trades, updatedOrders, remainingSize };
}
