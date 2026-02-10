import type { Order } from '$lib/types/database';

export interface ComputedMatch {
	restingOrderId: string;
	fillSize: number;
	tradePrice: number;
	buyerId: string;
	sellerId: string;
	buyOrderId: string;
	sellOrderId: string;
}

/**
 * Pure matching algorithm - computes which orders match without making DB calls.
 * Uses price-time priority (FIFO): best price first, then oldest first.
 *
 * The actual matching is done server-side by the match_order database function
 * which implements the same algorithm with proper row locking for atomicity.
 * This function exists for unit testing and documentation of the matching logic.
 */
export function computeMatches(incoming: Order, existingOrders: Order[]): ComputedMatch[] {
	const matches: ComputedMatch[] = [];
	let remainingSize = incoming.remaining_size;

	// Filter to opposite side orders that cross the incoming price
	const oppositeOrders = existingOrders
		.filter((o) => {
			if (o.asset_id !== incoming.asset_id) return false;
			if (o.status !== 'open' || o.remaining_size <= 0) return false;
			if (o.participant_id === incoming.participant_id) return false;

			if (incoming.side === 'buy') {
				// Buy order matches sells at price <= buy price
				return o.side === 'sell' && o.price <= incoming.price;
			} else {
				// Sell order matches buys at price >= sell price
				return o.side === 'buy' && o.price >= incoming.price;
			}
		})
		// Sort by price (best first), then by time (oldest first)
		.sort((a, b) => {
			if (incoming.side === 'buy') {
				// For buys, best sell is lowest price
				if (a.price !== b.price) return a.price - b.price;
			} else {
				// For sells, best buy is highest price
				if (a.price !== b.price) return b.price - a.price;
			}
			// Same price: oldest first (FIFO)
			return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
		});

	// Match against each resting order until filled
	for (const resting of oppositeOrders) {
		if (remainingSize <= 0) break;

		const fillSize = Math.min(remainingSize, resting.remaining_size);

		matches.push({
			restingOrderId: resting.id,
			fillSize,
			tradePrice: resting.price, // Execute at resting order's price
			buyerId: incoming.side === 'buy' ? incoming.participant_id : resting.participant_id,
			sellerId: incoming.side === 'sell' ? incoming.participant_id : resting.participant_id,
			buyOrderId: incoming.side === 'buy' ? incoming.id : resting.id,
			sellOrderId: incoming.side === 'sell' ? incoming.id : resting.id
		});

		remainingSize -= fillSize;
	}

	return matches;
}
