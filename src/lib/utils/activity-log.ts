import { supabase } from '$lib/supabase';
import type { ActivityDetails, ActivityType, Order, OrderSide } from '$lib/types/database';

/**
 * Insert a row into the activity log. Fire-and-forget from the caller's
 * perspective is fine (failures are logged, not thrown) since the log is a
 * supplementary feed, not critical path for trading.
 */
export async function logActivity(
	marketId: string,
	type: ActivityType,
	message: string,
	details: ActivityDetails
): Promise<void> {
	const { error } = await supabase.from('activity_log').insert({ market_id: marketId, type, message, details });
	if (error) {
		console.error('Failed to log activity:', error);
	}
}

// The "taker" crossed the book (aggressor); the "maker" was resting and got hit.
export function takerId(trade: { buyer_id: string; seller_id: string; taker_side: OrderSide | null }): string {
	return (trade.taker_side ?? 'buy') === 'sell' ? trade.seller_id : trade.buyer_id;
}

export function makerId(trade: { buyer_id: string; seller_id: string; taker_side: OrderSide | null }): string {
	return (trade.taker_side ?? 'buy') === 'sell' ? trade.buyer_id : trade.seller_id;
}

export interface TopOfBook {
	price: number;
	size: number;
}

/** Best resting price (and size at that price) for a side, before a new order is added. */
export function getTopOfBook(orders: Order[], assetId: string, side: OrderSide): TopOfBook | null {
	const resting = orders.filter(
		(o) => o.asset_id === assetId && o.side === side && o.status === 'open' && o.remaining_size > 0
	);
	if (resting.length === 0) return null;

	const bestPrice = side === 'buy' ? Math.max(...resting.map((o) => o.price)) : Math.min(...resting.map((o) => o.price));
	const size = resting.filter((o) => o.price === bestPrice).reduce((sum, o) => sum + o.remaining_size, 0);
	return { price: bestPrice, size };
}

/**
 * Whether a new order improves on the previous top of book: a bid is better
 * if it's priced higher or sized larger; an offer is better if it's priced
 * lower or sized larger. No prior resting order on that side means nothing
 * to improve on.
 */
export function evaluateOrderImprovement(
	side: OrderSide,
	price: number,
	size: number,
	prevBest: TopOfBook | null
): { better: boolean; highlightPrice: boolean; highlightSize: boolean } {
	if (!prevBest) return { better: false, highlightPrice: false, highlightSize: false };
	const highlightPrice = side === 'buy' ? price > prevBest.price : price < prevBest.price;
	const highlightSize = size > prevBest.size;
	return { better: highlightPrice || highlightSize, highlightPrice, highlightSize };
}

export function formatOrderNewMessage(
	actorName: string,
	side: OrderSide,
	price: number,
	size: number,
	assetName: string,
	better: boolean
): string {
	const verb = side === 'buy' ? 'bid' : 'offered';
	return `${actorName} is now ${better ? 'better ' : ''}${verb} ${price} for ${size} in ${assetName}`;
}

export function buildOrderCancelledDetails(
	actorName: string,
	side: OrderSide,
	price: number,
	size: number,
	assetName: string
): ActivityDetails {
	return { kind: 'order_cancelled', actorName, side, price, size, assetName };
}

export function formatOrderCancelledMessage(
	actorName: string,
	side: OrderSide,
	size: number,
	assetName: string,
	price: number
): string {
	const sideWord = side === 'buy' ? 'bid' : 'offer';
	return `${actorName} pulled their ${sideWord} for ${size} ${assetName} at ${price}`;
}

export function buildOrderAmendedDetails(
	actorName: string,
	side: OrderSide,
	assetName: string,
	oldPrice: number,
	oldSize: number,
	newPrice: number,
	newSize: number
): ActivityDetails {
	const verb: 'increased' | 'decreased' | 'changed' =
		oldPrice === newPrice ? (newSize > oldSize ? 'increased' : 'decreased') : 'changed';
	return { kind: 'order_amended', actorName, side, assetName, oldPrice, oldSize, newPrice, newSize, verb };
}

export function formatOrderAmendedMessage(
	actorName: string,
	side: OrderSide,
	assetName: string,
	oldSize: number,
	oldPrice: number,
	newSize: number,
	newPrice: number
): string {
	const sideWord = side === 'buy' ? 'bid' : 'offer';
	if (oldPrice === newPrice) {
		const verb = newSize > oldSize ? 'increased' : 'decreased';
		return `${actorName} ${verb} their ${sideWord} for ${assetName} from ${oldSize} to ${newSize} @ ${newPrice}`;
	}
	return `${actorName} changed their ${sideWord} for ${assetName} from ${oldSize} @ ${oldPrice} to ${newSize} @ ${newPrice}`;
}

export function buildTradeDetails(
	takerName: string,
	makerName: string,
	side: OrderSide,
	assetName: string,
	price: number,
	size: number
): ActivityDetails {
	return { kind: 'trade', takerName, makerName, side, assetName, price, size };
}

export function formatTradeMessage(
	takerName: string,
	makerName: string,
	takerSide: OrderSide,
	size: number,
	assetName: string,
	price: number
): string {
	return takerSide === 'buy'
		? `${takerName} bought ${size} ${assetName} from ${makerName} @ ${price}`
		: `${takerName} sold ${size} ${assetName} to ${makerName} @ ${price}`;
}

export function buildSettlementDetails(assetName: string, value: number): ActivityDetails {
	return { kind: 'settlement', assetName, value };
}

export function formatSettlementMessage(assetName: string, value: number): string {
	return `${assetName} settled at ${value}`;
}
