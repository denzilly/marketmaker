import { error, redirect } from '@sveltejs/kit';
import { supabase } from '$lib/supabase';
import type { PageLoad } from './$types';
import type { Market, Participant, Asset, Order, Message } from '$lib/types/database';

// Disable SSR - this page uses browser-only Supabase client
export const ssr = false;

export const load: PageLoad = async ({ params, url }) => {
	const code = params.code;
	const participantToken = url.searchParams.get('p');

	// Must have a participant token to access the market
	if (!participantToken) {
		throw redirect(302, `/?error=no_token&code=${code}`);
	}

	// Validate token and load participant
	const { data: participant, error: participantError } = await supabase
		.from('participants')
		.select('*')
		.eq('token', participantToken)
		.single();

	if (participantError || !participant) {
		throw redirect(302, `/?error=invalid_token&code=${code}`);
	}

	// Load market data
	const { data: market, error: marketError } = await supabase
		.from('markets')
		.select('*')
		.eq('id', participant.market_id)
		.single();

	if (marketError || !market) {
		throw error(404, 'Market not found');
	}

	// Verify the market code matches
	if (market.code !== code) {
		throw redirect(302, `/m/${market.code}?p=${participantToken}`);
	}

	// Load assets for this market
	const { data: assets } = await supabase
		.from('assets')
		.select('*')
		.eq('market_id', market.id)
		.order('created_at', { ascending: true });

	// Load all participants in this market (for trade display)
	const { data: participants } = await supabase
		.from('participants')
		.select('id, name')
		.eq('market_id', market.id);

	// Load open orders for all assets in this market
	const assetIds = (assets ?? []).map((a) => a.id);
	let orders: Order[] = [];
	let trades: Array<{
		id: string;
		asset_id: string;
		buyer_id: string;
		seller_id: string;
		price: number;
		size: number;
		executed_at: string;
	}> = [];

	if (assetIds.length > 0) {
		const { data: orderData } = await supabase
			.from('orders')
			.select('*')
			.in('asset_id', assetIds)
			.eq('status', 'open')
			.order('created_at', { ascending: true });
		orders = (orderData ?? []) as Order[];

		// Load recent trades for this market
		const { data: tradeData } = await supabase
			.from('trades')
			.select('id, asset_id, buyer_id, seller_id, price, size, executed_at')
			.in('asset_id', assetIds)
			.order('executed_at', { ascending: false })
			.limit(50);
		trades = tradeData ?? [];
	}

	// Load chat messages for this market
	const { data: messageData } = await supabase
		.from('messages')
		.select('*')
		.eq('market_id', market.id)
		.order('created_at', { ascending: true })
		.limit(100);
	const messages = (messageData ?? []) as Message[];

	// Load positions from database view (accurate, based on all trades)
	const { data: positionData } = await supabase
		.from('positions')
		.select('*')
		.in('participant_id', (participants ?? []).map(p => p.id));
	const positions = positionData ?? [];

	// Check if this is a first visit (show save link modal)
	const isFirstVisit = url.searchParams.get('first') !== 'false';

	return {
		market: market as Market,
		participant: participant as Participant,
		participants: (participants ?? []) as Array<{ id: string; name: string }>,
		assets: (assets ?? []) as Asset[],
		orders,
		trades,
		messages,
		positions,
		isFirstVisit
	};
};
