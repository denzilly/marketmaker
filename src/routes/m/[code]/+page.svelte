<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { supabase } from '$lib/supabase';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import OrderBook from '$lib/components/OrderBook.svelte';
	import TradeBlotter from '$lib/components/TradeBlotter.svelte';
	import PositionBlotter from '$lib/components/PositionBlotter.svelte';
	import SaveLinkModal from '$lib/components/SaveLinkModal.svelte';

	export let data;

	let channel: RealtimeChannel | null = null;

	let showSaveLinkModal = false;
	const SEEN_KEY = `mm_seen_${data.participant.token}`;

	function setupSubscriptions() {
		const assetIds = data.assets.map((a) => a.id);

		// Build the channel with subscriptions
		let channelBuilder = supabase
			.channel(`market-${data.market.id}-${Date.now()}`)
			// Always subscribe to assets (filtered by market_id)
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
							// Re-subscribe to include new asset's orders/trades
							resubscribeWithNewAssets();
						}
					} else if (payload.eventType === 'UPDATE') {
						data.assets = data.assets.map((a) =>
							a.id === payload.new.id ? (payload.new as any) : a
						);
					}
				}
			)
			// Always subscribe to participants (filtered by market_id)
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
			);

		// Only subscribe to orders/trades if there are assets
		if (assetIds.length > 0) {
			channelBuilder = channelBuilder
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'orders',
						filter: `asset_id=in.(${assetIds.join(',')})`
					},
					(payload) => {
						if (payload.eventType === 'INSERT') {
							if (!data.orders.find((o) => o.id === payload.new.id)) {
								data.orders = [...data.orders, payload.new as any];
							}
						} else if (payload.eventType === 'UPDATE') {
							data.orders = data.orders.map((o) =>
								o.id === payload.new.id ? (payload.new as any) : o
							);
						} else if (payload.eventType === 'DELETE') {
							data.orders = data.orders.filter((o) => o.id !== payload.old.id);
						}
					}
				)
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'trades',
						filter: `asset_id=in.(${assetIds.join(',')})`
					},
					(payload) => {
						if (!data.trades.find((t) => t.id === payload.new.id)) {
							data.trades = [payload.new as any, ...data.trades];
						}
					}
				);
		}

		channel = channelBuilder.subscribe();
	}

	async function resubscribeWithNewAssets() {
		if (channel) {
			await supabase.removeChannel(channel);
		}
		setupSubscriptions();
	}

	onMount(() => {
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
		// Add the new asset to the list
		data.assets = [...data.assets, event.detail];
	}

	function handleOrderCreated(event: CustomEvent) {
		// Add the new order to the list
		data.orders = [...data.orders, event.detail];
	}

	function handleOrderUpdated(event: CustomEvent) {
		// Update the order in the list (for fills)
		const updated = event.detail;
		data.orders = data.orders.map((o) => (o.id === updated.id ? updated : o));
	}

	function handleTradeExecuted(event: CustomEvent) {
		// Add the new trade to the list
		data.trades = [event.detail, ...data.trades];
	}

	function handleAssetUpdated(event: CustomEvent) {
		// Update the asset's last_price
		const { id, last_price } = event.detail;
		data.assets = data.assets.map((a) => (a.id === id ? { ...a, last_price } : a));
	}
</script>

<svelte:head>
	<title>Market: {data.market.code} | MarketMaker</title>
</svelte:head>

{#if showSaveLinkModal}
	<SaveLinkModal link={getPersonalLink()} on:close={handleModalClose} />
{/if}

<div class="market-page">
	<header>
		<div class="header-left">
			<h1>MarketMaker</h1>
			<span class="market-code">{data.market.code}</span>
		</div>
		<div class="header-right">
			<span class="participant-name">{data.participant.name}</span>
			{#if data.participant.is_admin}
				<span class="admin-badge">Admin</span>
			{/if}
			<button class="link-btn" on:click={() => (showSaveLinkModal = true)}>
				My Link
			</button>
		</div>
	</header>

	<main>
		<section class="orderbook-section">
			<h2>Order Book</h2>
			<OrderBook
				assets={data.assets}
				orders={data.orders}
				marketId={data.market.id}
				participantId={data.participant.id}
				on:assetCreated={handleAssetCreated}
				on:orderCreated={handleOrderCreated}
				on:orderUpdated={handleOrderUpdated}
				on:tradeExecuted={handleTradeExecuted}
				on:assetUpdated={handleAssetUpdated}
			/>
		</section>

		<aside class="sidebar">
			<section class="positions-section">
				<h2>My Positions</h2>
				<PositionBlotter />
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
		background: #1a1a1a;
		border-bottom: 1px solid #333;
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
		color: #6eb5ff;
		background: #1e3a5f;
		padding: 0.25rem 0.75rem;
		border-radius: 4px;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.participant-name {
		color: #aaa;
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

	.link-btn {
		background: transparent;
		border: 1px solid #333;
		color: #888;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
	}

	.link-btn:hover {
		border-color: #555;
		color: #aaa;
	}

	main {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 350px;
		gap: 1rem;
		padding: 1rem;
	}

	section h2 {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
		margin: 0 0 1rem 0;
	}

	.orderbook-section {
		background: #1a1a1a;
		border-radius: 12px;
		border: 1px solid #333;
		padding: 1rem;
	}

	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.positions-section,
	.trades-section {
		background: #1a1a1a;
		border-radius: 12px;
		border: 1px solid #333;
		padding: 1rem;
	}

	.positions-section {
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
</style>
