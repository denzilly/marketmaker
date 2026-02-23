<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { supabase } from '$lib/supabase';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import OrderBook from '$lib/components/OrderBook.svelte';
	import TradeBlotter from '$lib/components/TradeBlotter.svelte';
	import PositionBlotter from '$lib/components/PositionBlotter.svelte';
	import ActiveOrders from '$lib/components/ActiveOrders.svelte';
	import SaveLinkModal from '$lib/components/SaveLinkModal.svelte';
	import SettleUpModal from '$lib/components/SettleUpModal.svelte';
	import AdminPanel from '$lib/components/AdminPanel.svelte';
	import HelpPanel from '$lib/components/HelpPanel.svelte';
	import ChatPanel from '$lib/components/ChatPanel.svelte';

	export let data;

	let channel: RealtimeChannel | null = null;
	let reconnectTimer: ReturnType<typeof setInterval> | null = null;
	let connectionStatus: 'connected' | 'reconnecting' | 'error' = 'connected';

	let showSaveLinkModal = false;
	let showSettleUpModal = false;
	let showAdminPanel = false;
	let showHelp = false;
	const SEEN_KEY = `mm_seen_${data.participant.token}`;

	let orderSound: HTMLAudioElement;
	let tradeSound: HTMLAudioElement;

	function playSound(sound: HTMLAudioElement) {
		sound.currentTime = 0;
		sound.play().catch(() => {});
	}

	// Helper to check if an asset belongs to this market
	function isMarketAsset(assetId: string): boolean {
		return data.assets.some((a) => a.id === assetId);
	}

	// Refresh positions from database
	async function refreshPositions() {
		const { data: positionData, error: posError } = await supabase
			.from('positions')
			.select('*')
			.in('participant_id', data.participants.map(p => p.id));
		if (posError) { console.error('Failed to load positions:', posError); return; }
		if (positionData) {
			data.positions = positionData;
		}
	}

	function setupSubscriptions() {
		channel = supabase
			.channel(`market-${data.market.id}`)
			// Subscribe to assets (filtered by market_id)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'assets',
					filter: `market_id=eq.${data.market.id}`
				},
				(payload) => {
					if (payload.eventType === 'INSERT') {
						if (!data.assets.find((a) => a.id === payload.new.id)) {
							data.assets = [...data.assets, payload.new as any];
						}
					} else if (payload.eventType === 'UPDATE') {
						data.assets = data.assets.map((a) =>
							a.id === payload.new.id ? (payload.new as any) : a
						);
						// Refresh positions when an asset settles so P&L uses settlement_value
						if (payload.new.status === 'settled') {
							refreshPositions().catch((e) => console.error('Position refresh failed:', e));
						}
					}
				}
			)
			// Subscribe to participants (filtered by market_id)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'participants',
					filter: `market_id=eq.${data.market.id}`
				},
				(payload) => {
					if (!data.participants.find((p) => p.id === payload.new.id)) {
						data.participants = [
							...data.participants,
							{ id: payload.new.id, name: payload.new.name }
						];
					}
				}
			)
			// Subscribe to all orders - filter client-side by checking if asset belongs to market
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'orders'
				},
				(payload) => {
					if (payload.eventType === 'DELETE') {
						// DELETE events only have the id in payload.old, so check if
						// we're tracking this order locally instead of checking asset
						data.orders = data.orders.filter((o) => o.id !== payload.old.id);
						return;
					}

					const assetId = payload.new?.asset_id;
					if (!isMarketAsset(assetId)) return;

					if (payload.eventType === 'INSERT') {
						if (!data.orders.find((o) => o.id === payload.new.id)) {
							data.orders = [...data.orders, payload.new as any];
							playSound(orderSound);
						}
					} else if (payload.eventType === 'UPDATE') {
						data.orders = data.orders.map((o) =>
							o.id === payload.new.id ? (payload.new as any) : o
						);
					}
				}
			)
			// Subscribe to all trades - filter client-side
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'trades'
				},
				async (payload) => {
					if (!isMarketAsset(payload.new.asset_id)) return;

					if (!data.trades.find((t) => t.id === payload.new.id)) {
						data.trades = [payload.new as any, ...data.trades];
						playSound(tradeSound);
						// Refresh positions after trade
						try { await refreshPositions(); } catch (e) { console.error('Position refresh failed:', e); }
					}
				}
			)
			// Subscribe to chat messages (filtered by market_id)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'messages',
					filter: `market_id=eq.${data.market.id}`
				},
				(payload) => {
					if (!data.messages.find((m: any) => m.id === payload.new.id)) {
						data.messages = [...data.messages, payload.new as any];
					}
				}
			)
			.subscribe((status, err) => {
				if (status === 'SUBSCRIBED') {
					connectionStatus = 'connected';
				} else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
					console.warn('Realtime channel issue:', status, err);
					connectionStatus = 'reconnecting';
					scheduleReconnect();
				}
			});
	}

	async function reconnect() {
		// Tear down old channel
		if (channel) {
			await supabase.removeChannel(channel);
			channel = null;
		}

		// Re-fetch fresh state from DB to catch anything missed while disconnected
		try {
			const assetIds = data.assets.map(a => a.id);
			const [ordersRes, tradesRes, assetsRes, messagesRes, positionsRes] = await Promise.all([
				supabase.from('orders').select('*').in('asset_id', assetIds).eq('status', 'open').order('created_at', { ascending: true }),
				supabase.from('trades').select('id, asset_id, buyer_id, seller_id, price, size, executed_at').in('asset_id', assetIds).order('executed_at', { ascending: false }).limit(50),
				supabase.from('assets').select('*').eq('market_id', data.market.id),
				supabase.from('messages').select('*').eq('market_id', data.market.id).order('created_at', { ascending: true }).limit(100),
				supabase.from('positions').select('*').in('participant_id', data.participants.map(p => p.id))
			]);

			if (assetsRes.data) data.assets = assetsRes.data as any;
			if (ordersRes.data) data.orders = ordersRes.data as any;
			if (tradesRes.data) data.trades = tradesRes.data;
			if (messagesRes.data) data.messages = messagesRes.data as any;
			if (positionsRes.data) data.positions = positionsRes.data;
		} catch (e) {
			console.error('Failed to refresh data on reconnect:', e);
		}

		// Re-subscribe
		setupSubscriptions();
	}

	function scheduleReconnect() {
		if (reconnectTimer) return;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			reconnect();
		}, 3000) as ReturnType<typeof setTimeout>;
	}

	onMount(() => {
		orderSound = new Audio('/sounds/order.mp3');
		tradeSound = new Audio('/sounds/trade.mp3');

		// Show save link modal on first visit (if not seen before)
		if (data.isFirstVisit && !localStorage.getItem(SEEN_KEY)) {
			showSaveLinkModal = true;
		}

		// Set up real-time subscriptions
		setupSubscriptions();
	});

	onDestroy(() => {
		if (channel) {
			supabase.removeChannel(channel);
		}
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
		}
	});

	function handleModalClose() {
		showSaveLinkModal = false;
		// Remember that user has seen the modal
		localStorage.setItem(SEEN_KEY, 'true');
		// Clean up URL to remove first visit indicator
		const url = new URL(window.location.href);
		url.searchParams.set('first', 'false');
		window.history.replaceState({}, '', url);
	}

	function getPersonalLink(): string {
		if (!browser) return '';
		const baseUrl = $page.url.origin;
		return `${baseUrl}/m/${data.market.code}?p=${data.participant.token}`;
	}

	function handleAssetCreated(event: CustomEvent) {
		if (data.assets.find((a) => a.id === event.detail.id)) return;
		data.assets = [...data.assets, event.detail];
	}

	function handleOrderCreated(event: CustomEvent) {
		if (data.orders.find((o) => o.id === event.detail.id)) return;
		data.orders = [...data.orders, event.detail];
	}

	function handleOrderUpdated(event: CustomEvent) {
		// Update the order in the list (for fills)
		const updated = event.detail;
		data.orders = data.orders.map((o) => (o.id === updated.id ? updated : o));
	}

	async function handleTradeExecuted(event: CustomEvent) {
		if (data.trades.find((t) => t.id === event.detail.id)) return;
		data.trades = [event.detail, ...data.trades];
		// Refresh positions after trade execution
		await refreshPositions();
	}

	function handleAssetUpdated(event: CustomEvent) {
		// Update the asset's last_price
		const { id, last_price } = event.detail;
		data.assets = data.assets.map((a) => (a.id === id ? { ...a, last_price } : a));
	}

	function handleOrderCancelled(event: CustomEvent) {
		data.orders = data.orders.filter((o) => o.id !== event.detail.id);
	}

	function handleOrderAmended(event: CustomEvent) {
		const amended = event.detail;
		data.orders = data.orders.map((o) => (o.id === amended.id ? amended : o));
	}

	function handleAssetDeleted(event: CustomEvent) {
		const { id } = event.detail;
		data.assets = data.assets.filter((a) => a.id !== id);
		data.orders = data.orders.filter((o) => o.asset_id !== id);
		data.trades = data.trades.filter((t) => t.asset_id !== id);
	}

	async function handleAssetSettled(event: CustomEvent) {
		const settledAsset = event.detail;
		data.assets = data.assets.map((a) =>
			a.id === settledAsset.id ? settledAsset : a
		);
		data.orders = data.orders.filter((o) => o.asset_id !== settledAsset.id);
		await refreshPositions();
	}
</script>

<svelte:head>
	<title>Market: {data.market.code} | MarketMaker</title>
</svelte:head>

{#if showSaveLinkModal}
	<SaveLinkModal link={getPersonalLink()} on:close={handleModalClose} />
{/if}

{#if showAdminPanel}
	<AdminPanel
		marketId={data.market.id}
		marketCode={data.market.code}
		on:close={() => (showAdminPanel = false)}
	/>
{/if}

{#if showHelp}
	<HelpPanel on:close={() => (showHelp = false)} />
{/if}

{#if showSettleUpModal}
	<SettleUpModal
		trades={data.trades}
		assets={data.assets}
		participants={data.participants}
		on:close={() => (showSettleUpModal = false)}
	/>
{/if}

<div class="market-page">
	<header>
		<div class="header-left">
			<h1>MarketMaker</h1>
			<span class="market-code">{data.market.code}</span>
			{#if connectionStatus !== 'connected'}
				<span class="connection-status" class:reconnecting={connectionStatus === 'reconnecting'}>
					{connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Connection lost'}
				</span>
			{/if}
		</div>
		<div class="header-right">
			<span class="participant-name">{data.participant.name}</span>
			{#if data.participant.is_admin}
				<span class="admin-badge">Admin</span>
				<button class="admin-btn" on:click={() => (showAdminPanel = true)}>
					Admin Panel
				</button>
			{/if}
			<button class="settle-up-btn" on:click={() => (showSettleUpModal = true)}>
				Settle Up
			</button>
			<button class="link-btn" on:click={() => (showSaveLinkModal = true)}>
				My Link
			</button>
			<button class="help-btn" on:click={() => (showHelp = true)}>
				?
			</button>
		</div>
	</header>

	<main>
		<div class="left-column">
			<section class="orderbook-section">
				<h2>Order Book</h2>
				<OrderBook
					assets={data.assets}
					orders={data.orders}
					marketId={data.market.id}
					participantId={data.participant.id}
					isAdmin={data.participant.is_admin}
					on:assetCreated={handleAssetCreated}
					on:orderCreated={handleOrderCreated}
					on:orderUpdated={handleOrderUpdated}
					on:tradeExecuted={handleTradeExecuted}
					on:assetUpdated={handleAssetUpdated}
					on:assetSettled={handleAssetSettled}
					on:assetDeleted={handleAssetDeleted}
				/>
			</section>

			<section class="chat-section">
				<ChatPanel
					messages={data.messages}
					participants={data.participants}
					participantId={data.participant.id}
					marketId={data.market.id}
				/>
			</section>
		</div>

		<aside class="sidebar">
			<section class="positions-section">
				<PositionBlotter
					positions={data.positions}
					participantId={data.participant.id}
					participants={data.participants}
				/>
			</section>

			<section class="orders-section">
				<ActiveOrders
					orders={data.orders}
					assets={data.assets}
					participantId={data.participant.id}
					participants={data.participants}
					on:orderCancelled={handleOrderCancelled}
					on:orderAmended={handleOrderAmended}
					on:orderUpdated={handleOrderUpdated}
					on:tradeExecuted={handleTradeExecuted}
					on:assetUpdated={handleAssetUpdated}
				/>
			</section>

			<section class="trades-section">
				<h2>Recent Trades</h2>
				<TradeBlotter
					trades={data.trades}
					assets={data.assets}
					participants={data.participants}
				/>
			</section>
		</aside>
	</main>
</div>

<style>
	.market-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		background: #111b2e;
		border-bottom: 1px solid #243254;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	h1 {
		font-size: 1.25rem;
		margin: 0;
		color: #fff;
	}

	.market-code {
		font-size: 0.875rem;
		color: #7ec8ff;
		background: #162e50;
		padding: 0.25rem 0.75rem;
		border-radius: 4px;
	}

	.connection-status {
		font-size: 0.75rem;
		color: #ef4444;
		background: rgba(239, 68, 68, 0.15);
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
	}

	.connection-status.reconnecting {
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.15);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.participant-name {
		color: #8498b5;
		font-size: 0.875rem;
	}

	.admin-badge {
		font-size: 0.75rem;
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.15);
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.admin-btn {
		background: transparent;
		border: 1px solid #fbbf24;
		color: #fbbf24;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.admin-btn:hover {
		background: rgba(251, 191, 36, 0.15);
	}

	.link-btn {
		background: transparent;
		border: 1px solid #243254;
		color: #607a9c;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
	}

	.link-btn:hover {
		border-color: #3d5078;
		color: #8498b5;
	}

	.help-btn {
		background: transparent;
		border: 1px solid #243254;
		color: #607a9c;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		font-size: 0.875rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.help-btn:hover {
		border-color: #3d5078;
		color: #8498b5;
	}

	.settle-up-btn {
		background: transparent;
		border: 1px solid #fbbf24;
		color: #fbbf24;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.settle-up-btn:hover {
		background: rgba(251, 191, 36, 0.15);
	}

	main {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 400px;
		gap: 0.7rem;
		padding: 0.7rem;
	}

	section h2 {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #607a9c;
		margin: 0 0 1rem 0;
	}

	.left-column {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.orderbook-section {
		background: #111b2e;
		border-radius: 0px;
		border: 1px solid #243254;
		padding: 1rem;
	}

	.chat-section {
		background: #111b2e;
		border-radius: 0px;
		border: 1px solid #243254;
		padding: 1rem;
		max-height: 250px;
		display: flex;
		flex-direction: column;
	}

	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.positions-section,
	.orders-section,
	.trades-section {
		background: #111b2e;
		border-radius: 0px;
		border: 1px solid #243254;
		padding: 1rem;
	}

	.positions-section,
	.orders-section {
		flex-shrink: 0;
	}

	.trades-section {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	@media (max-width: 900px) {
		main {
			grid-template-columns: 1fr;
		}

		.sidebar {
			flex-direction: row;
		}

		.positions-section,
		.trades-section {
			flex: 1;
		}
	}

	@media (max-width: 600px) {
		header {
			flex-direction: column;
			gap: 0.75rem;
			padding: 0.75rem 1rem;
		}

		.header-right {
			flex-wrap: wrap;
			justify-content: center;
			gap: 0.5rem;
		}

		main {
			grid-template-columns: 1fr;
			gap: 0.5rem;
			padding: 0.5rem;
		}

		.sidebar {
			flex-direction: column;
		}

		.trades-section {
			max-height: 300px;
			overflow: hidden;
		}
	}
</style>
