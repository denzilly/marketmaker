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
