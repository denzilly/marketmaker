export interface Market {
	id: string;
	code: string;
	name: string;
	created_at: string;
	created_by: string;
}

export interface Participant {
	id: string;
	market_id: string;
	name: string;
	token: string;
	is_admin: boolean;
	joined_at: string;
}

export interface Asset {
	id: string;
	market_id: string;
	name: string;
	description: string | null;
	created_by: string;
	created_at: string;
	status: 'trading' | 'settled';
	settlement_value: number | null;
	settled_at: string | null;
	last_price: number | null;
}

export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'open' | 'filled' | 'cancelled';

export interface Order {
	id: string;
	asset_id: string;
	participant_id: string;
	side: OrderSide;
	price: number;
	size: number;
	remaining_size: number;
	status: OrderStatus;
	created_at: string;
}

export interface Trade {
	id: string;
	asset_id: string;
	buy_order_id: string;
	sell_order_id: string;
	buyer_id: string;
	seller_id: string;
	price: number;
	size: number;
	executed_at: string;
	// Which side crossed the book (aggressor). Null for trades recorded before this was tracked.
	taker_side: OrderSide | null;
	// True when the trade came from an accepted OTC proposal rather than the order book.
	// Null/absent on trades recorded before OTC trading existed.
	is_otc?: boolean | null;
}

export type OtcStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

/**
 * A bilateral trade proposal sent directly to another participant, bypassing
 * the order book. `side` is from the PROPOSER's perspective: 'buy' means the
 * proposer wants to buy from the counterparty, 'sell' means sell to them.
 */
export interface OtcProposal {
	id: string;
	market_id: string;
	asset_id: string;
	proposer_id: string;
	counterparty_id: string;
	side: OrderSide;
	price: number;
	size: number;
	status: OtcStatus;
	trade_id: string | null;
	created_at: string;
	updated_at: string;
	resolved_at: string | null;
}

export interface Message {
	id: string;
	market_id: string;
	participant_id: string;
	content: string;
	created_at: string;
}

export type ActivityType = 'order_new' | 'order_cancelled' | 'order_amended' | 'trade' | 'settlement';

// Structured payload per activity type, so the UI can style individual pieces
// (asset name, changed price/size) instead of re-parsing a sentence.
export type ActivityDetails =
	| {
			kind: 'order_new';
			actorName: string;
			side: OrderSide;
			price: number;
			size: number;
			assetName: string;
			better: boolean;
			highlightPrice: boolean;
			highlightSize: boolean;
	  }
	| {
			kind: 'order_cancelled';
			actorName: string;
			side: OrderSide;
			price: number;
			size: number;
			assetName: string;
	  }
	| {
			kind: 'order_amended';
			actorName: string;
			side: OrderSide;
			assetName: string;
			oldPrice: number;
			oldSize: number;
			newPrice: number;
			newSize: number;
			verb: 'increased' | 'decreased' | 'changed';
	  }
	| {
			kind: 'trade';
			takerName: string;
			makerName: string;
			side: OrderSide;
			assetName: string;
			price: number;
			size: number;
			// Set on trades printed from an accepted OTC proposal, so the feed can tag them.
			otc?: boolean;
	  }
	| {
			kind: 'settlement';
			assetName: string;
			value: number;
	  };

export interface ActivityLogEntry {
	id: string;
	market_id: string;
	type: ActivityType;
	message: string;
	details: ActivityDetails | null;
	created_at: string;
}

export interface Position {
	participant_id: string;
	asset_id: string;
	net_position: number;
	cash_flow: number;
	unrealized_pnl: number | null;
}

// Extended types with joined data for the UI
export interface OrderWithParticipant extends Order {
	participant: Pick<Participant, 'id' | 'name'>;
}

export interface TradeWithParticipants extends Trade {
	buyer: Pick<Participant, 'id' | 'name'>;
	seller: Pick<Participant, 'id' | 'name'>;
	asset: Pick<Asset, 'id' | 'name'>;
}

export interface PositionWithAsset extends Position {
	asset: Pick<Asset, 'id' | 'name' | 'last_price' | 'status' | 'settlement_value'>;
}
