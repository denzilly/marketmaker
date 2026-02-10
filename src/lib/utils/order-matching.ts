import { supabase } from '$lib/supabase';
import type { Order, Trade } from '$lib/types/database';

export interface MatchResult {
	trades: Trade[];
	updatedOrders: Order[];
	remainingSize: number;
}

/**
 * Match an order against the order book using the server-side matching function.
 * Uses database-level row locking to prevent race conditions and wraps
 * all operations in a single transaction for atomicity.
 */
export async function matchOrder(orderId: string): Promise<MatchResult> {
	const { data, error } = await supabase.rpc('match_order', {
		p_order_id: orderId
	});

	if (error) {
		console.error('Order matching failed:', error);
		return { trades: [], updatedOrders: [], remainingSize: 0 };
	}

	// Handle both direct JSONB return and array-wrapped return from PostgREST
	const result = Array.isArray(data) ? data[0] : data;

	return {
		trades: (result?.trades ?? []) as Trade[],
		updatedOrders: (result?.updated_orders ?? []) as Order[],
		remainingSize: result?.remaining_size ?? 0
	};
}
