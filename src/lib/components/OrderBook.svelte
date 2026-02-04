<script lang="ts">
	import type { Asset, Order } from '$lib/types/database';

	// TODO: Replace with real data from Supabase store
	let assets: Asset[] = [];
	let orders: Order[] = [];

	// Group orders by asset
	$: ordersByAsset = assets.map((asset) => {
		const assetOrders = orders.filter((o) => o.asset_id === asset.id && o.status === 'open');
		const bids = assetOrders
			.filter((o) => o.side === 'buy')
			.sort((a, b) => b.price - a.price);
		const asks = assetOrders
			.filter((o) => o.side === 'sell')
			.sort((a, b) => a.price - b.price);

		return {
			asset,
			topBid: bids[0] ?? null,
			topAsk: asks[0] ?? null,
			bids,
			asks
		};
	});
</script>

<div class="orderbook">
	{#if assets.length === 0}
		<div class="empty">
			<p>No assets yet.</p>
			<button class="create-asset-btn">+ Create Asset</button>
		</div>
	{:else}
		<table>
			<thead>
				<tr>
					<th class="asset-col">Asset</th>
					<th class="bid-col">Bid</th>
					<th class="size-col">Size</th>
					<th class="ask-col">Ask</th>
					<th class="size-col">Size</th>
					<th class="actions-col"></th>
				</tr>
			</thead>
			<tbody>
				{#each ordersByAsset as { asset, topBid, topAsk }}
					<tr>
						<td class="asset-col">
							<span class="asset-name">{asset.name}</span>
							{#if asset.last_price !== null}
								<span class="last-price">Last: {asset.last_price}</span>
							{/if}
						</td>
						<td class="bid-col">
							{#if topBid}
								<button class="price-btn bid">{topBid.price}</button>
							{:else}
								<span class="no-price">-</span>
							{/if}
						</td>
						<td class="size-col">{topBid?.remaining_size ?? '-'}</td>
						<td class="ask-col">
							{#if topAsk}
								<button class="price-btn ask">{topAsk.price}</button>
							{:else}
								<span class="no-price">-</span>
							{/if}
						</td>
						<td class="size-col">{topAsk?.remaining_size ?? '-'}</td>
						<td class="actions-col">
							<button class="expand-btn">▼</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.orderbook {
		width: 100%;
	}

	.empty {
		text-align: center;
		padding: 2rem;
		color: #888;
	}

	.create-asset-btn {
		margin-top: 1rem;
		padding: 0.75rem 1.5rem;
		background: #2563eb;
		color: #fff;
		border: none;
		border-radius: 8px;
		font-size: 0.875rem;
	}

	.create-asset-btn:hover {
		background: #1d4ed8;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		text-align: left;
		padding: 0.5rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #666;
		border-bottom: 1px solid #333;
	}

	td {
		padding: 0.75rem 0.5rem;
		border-bottom: 1px solid #222;
	}

	.asset-col {
		min-width: 150px;
	}

	.asset-name {
		display: block;
		font-weight: 500;
		color: #fff;
	}

	.last-price {
		font-size: 0.75rem;
		color: #666;
	}

	.bid-col,
	.ask-col {
		width: 80px;
	}

	.size-col {
		width: 60px;
		color: #888;
		font-size: 0.875rem;
	}

	.actions-col {
		width: 40px;
	}

	.price-btn {
		padding: 0.375rem 0.75rem;
		border: none;
		border-radius: 4px;
		font-weight: 500;
		font-size: 0.875rem;
	}

	.price-btn.bid {
		background: #14532d;
		color: #4ade80;
	}

	.price-btn.bid:hover {
		background: #166534;
	}

	.price-btn.ask {
		background: #7f1d1d;
		color: #f87171;
	}

	.price-btn.ask:hover {
		background: #991b1b;
	}

	.no-price {
		color: #444;
	}

	.expand-btn {
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: 1px solid #333;
		border-radius: 4px;
		color: #666;
		font-size: 0.75rem;
	}

	.expand-btn:hover {
		border-color: #555;
		color: #888;
	}
</style>
