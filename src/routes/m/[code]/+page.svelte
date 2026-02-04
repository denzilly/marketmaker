<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import OrderBook from '$lib/components/OrderBook.svelte';
	import TradeBlotter from '$lib/components/TradeBlotter.svelte';
	import PositionBlotter from '$lib/components/PositionBlotter.svelte';
	import SaveLinkModal from '$lib/components/SaveLinkModal.svelte';

	export let data;

	let showSaveLinkModal = false;

	onMount(() => {
		// Show the save link modal if this is a new join
		const isNewJoin = $page.url.searchParams.get('new') === 'true';
		if (isNewJoin) {
			showSaveLinkModal = true;
			// Clean up the URL
			const url = new URL(window.location.href);
			url.searchParams.delete('new');
			url.searchParams.delete('name');
			url.searchParams.delete('create');
			window.history.replaceState({}, '', url);
		}
	});

	function getPersonalLink(): string {
		// TODO: Generate actual personal link with participant token
		const baseUrl = $page.url.origin;
		return `${baseUrl}/m/${$page.params.code}?p=TOKEN_HERE`;
	}
</script>

<svelte:head>
	<title>Market: {$page.params.code} | MarketMaker</title>
</svelte:head>

{#if showSaveLinkModal}
	<SaveLinkModal link={getPersonalLink()} on:close={() => (showSaveLinkModal = false)} />
{/if}

<div class="market-page">
	<header>
		<div class="header-left">
			<h1>MarketMaker</h1>
			<span class="market-code">{$page.params.code}</span>
		</div>
		<div class="header-right">
			<span class="participant-name">TODO: Name</span>
			<button class="link-btn" on:click={() => (showSaveLinkModal = true)}>
				My Link
			</button>
		</div>
	</header>

	<main>
		<section class="orderbook-section">
			<h2>Order Book</h2>
			<OrderBook />
		</section>

		<aside class="sidebar">
			<section class="positions-section">
				<h2>My Positions</h2>
				<PositionBlotter />
			</section>

			<section class="trades-section">
				<h2>Recent Trades</h2>
				<TradeBlotter />
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
