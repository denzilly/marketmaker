<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { matchOrder } from '$lib/utils/order-matching';
	import type { Asset, Order, OrderSide } from '$lib/types/database';

	export let assets: Asset[] = [];
	export let orders: Order[] = [];
	export let marketId: string;
	export let participantId: string;

	const dispatch = createEventDispatcher();

	// Asset creation form state
	let showCreateForm = false;
	let newAssetName = '';
	let newAssetDescription = '';
	let creating = false;
	let createError = '';

	// Order entry state (two-way pricing)
	let expandedAssetId: string | null = null;
	let bidSize = '';
	let bidPrice = '';
	let offerPrice = '';
	let offerSize = '';
	let submittingOrder = false;
	let orderError = '';

	async function createAsset() {
		if (!newAssetName.trim()) return;

		creating = true;
		createError = '';

		try {
			const { data: asset, error } = await supabase
				.from('assets')
				.insert({
					market_id: marketId,
					name: newAssetName.trim(),
					description: newAssetDescription.trim() || null,
					created_by: participantId
				})
				.select()
				.single();

			if (error) throw error;

			// Dispatch event to parent
			dispatch('assetCreated', asset);

			// Reset form
			newAssetName = '';
			newAssetDescription = '';
			showCreateForm = false;
		} catch (e) {
			createError = e instanceof Error ? e.message : 'Failed to create asset';
		} finally {
			creating = false;
		}
	}

	function cancelCreate() {
		showCreateForm = false;
		newAssetName = '';
		newAssetDescription = '';
		createError = '';
	}

	function toggleExpand(assetId: string) {
		if (expandedAssetId === assetId) {
			expandedAssetId = null;
		} else {
			expandedAssetId = assetId;
			// Reset order form
			bidSize = '';
			bidPrice = '';
			offerPrice = '';
			offerSize = '';
			orderError = '';
		}
	}

	function prefillOrder(side: OrderSide, price: number, assetId: string) {
		expandedAssetId = assetId;
		if (side === 'buy') {
			offerPrice = price.toString();
			offerSize = '';
		} else {
			bidPrice = price.toString();
			bidSize = '';
		}
		orderError = '';
	}

	async function submitOrders() {
		if (!expandedAssetId) return;

		const hasBid = bidPrice && bidSize;
		const hasOffer = offerPrice && offerSize;

		if (!hasBid && !hasOffer) {
			orderError = 'Enter at least one side (bid or offer)';
			return;
		}

		// Validate bid
		if (hasBid) {
			const price = parseFloat(bidPrice);
			const size = parseInt(bidSize, 10);
			if (isNaN(price) || price <= 0) {
				orderError = 'Bid price must be a positive number';
				return;
			}
			if (isNaN(size) || size <= 0) {
				orderError = 'Bid size must be a positive integer';
				return;
			}
		}

		// Validate offer
		if (hasOffer) {
			const price = parseFloat(offerPrice);
			const size = parseInt(offerSize, 10);
			if (isNaN(price) || price <= 0) {
				orderError = 'Offer price must be a positive number';
				return;
			}
			if (isNaN(size) || size <= 0) {
				orderError = 'Offer size must be a positive integer';
				return;
			}
		}

		// Check bid < offer if both sides present
		if (hasBid && hasOffer) {
			if (parseFloat(bidPrice) >= parseFloat(offerPrice)) {
				orderError = 'Bid must be less than offer';
				return;
			}
		}

		submittingOrder = true;
		orderError = '';

		try {
			const ordersToInsert = [];

			if (hasBid) {
				ordersToInsert.push({
					asset_id: expandedAssetId,
					participant_id: participantId,
					side: 'buy' as OrderSide,
					price: parseFloat(bidPrice),
					size: parseInt(bidSize, 10),
					remaining_size: parseInt(bidSize, 10)
				});
			}

			if (hasOffer) {
				ordersToInsert.push({
					asset_id: expandedAssetId,
					participant_id: participantId,
					side: 'sell' as OrderSide,
					price: parseFloat(offerPrice),
					size: parseInt(offerSize, 10),
					remaining_size: parseInt(offerSize, 10)
				});
			}

			const { data: newOrders, error } = await supabase
				.from('orders')
				.insert(ordersToInsert)
				.select();

			if (error) throw error;

			// Process each new order: dispatch event and try to match
			for (const order of newOrders ?? []) {
				dispatch('orderCreated', order);

				// Try to match the order against existing orders
				const result = await matchOrder(order as Order, orders);

				// Dispatch trade events
				for (const trade of result.trades) {
					dispatch('tradeExecuted', trade);
				}

				// Dispatch order update events (for filled/partially filled orders)
				for (const updatedOrder of result.updatedOrders) {
					dispatch('orderUpdated', updatedOrder);
				}

				// If trades occurred, update the asset's last price in local state
				if (result.trades.length > 0) {
					const lastPrice = result.trades[result.trades.length - 1].price;
					dispatch('assetUpdated', { id: expandedAssetId, last_price: lastPrice });
				}
			}

			// Reset form and collapse
			bidSize = '';
			bidPrice = '';
			offerPrice = '';
			offerSize = '';
			expandedAssetId = null;
		} catch (e) {
			orderError = e instanceof Error ? e.message : 'Failed to submit order';
		} finally {
			submittingOrder = false;
		}
	}

	$: canSubmit = (bidPrice && bidSize) || (offerPrice && offerSize);

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
	{#if showCreateForm}
		<div class="create-form">
			<h3>Create New Asset</h3>
			{#if createError}
				<div class="error">{createError}</div>
			{/if}
			<label>
				Name
				<input
					type="text"
					bind:value={newAssetName}
					placeholder="e.g. Bill's Math Test Score"
					maxlength="50"
					disabled={creating}
				/>
			</label>
			<label>
				Description (optional)
				<input
					type="text"
					bind:value={newAssetDescription}
					placeholder="What are we trading on?"
					maxlength="200"
					disabled={creating}
				/>
			</label>
			<div class="form-buttons">
				<button class="primary" on:click={createAsset} disabled={!newAssetName.trim() || creating}>
					{creating ? 'Creating...' : 'Create'}
				</button>
				<button class="secondary" on:click={cancelCreate} disabled={creating}>
					Cancel
				</button>
			</div>
		</div>
	{:else if assets.length === 0}
		<div class="empty">
			<p>No assets yet.</p>
			<button class="create-asset-btn" on:click={() => (showCreateForm = true)}>+ Create Asset</button>
		</div>
	{:else}
		<div class="table-header">
			<button class="create-asset-btn small" on:click={() => (showCreateForm = true)}>+ New Asset</button>
		</div>
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
					<tr class:expanded={expandedAssetId === asset.id}>
						<td class="asset-col">
							<span class="asset-name">{asset.name}</span>
							{#if asset.description}
								<span class="asset-desc">{asset.description}</span>
							{:else if asset.last_price !== null}
								<span class="last-price">Last: {asset.last_price}</span>
							{/if}
						</td>
						<td class="bid-col">
							{#if topBid}
								<button class="price-btn bid" on:click={() => prefillOrder('sell', topBid.price, asset.id)}>
									{topBid.price}
								</button>
							{:else}
								<span class="no-price">-</span>
							{/if}
						</td>
						<td class="size-col">{topBid?.remaining_size ?? '-'}</td>
						<td class="ask-col">
							{#if topAsk}
								<button class="price-btn ask" on:click={() => prefillOrder('buy', topAsk.price, asset.id)}>
									{topAsk.price}
								</button>
							{:else}
								<span class="no-price">-</span>
							{/if}
						</td>
						<td class="size-col">{topAsk?.remaining_size ?? '-'}</td>
						<td class="actions-col">
							<button class="expand-btn" class:active={expandedAssetId === asset.id} on:click={() => toggleExpand(asset.id)}>
								{expandedAssetId === asset.id ? '▲' : '▼'}
							</button>
						</td>
					</tr>
					{#if expandedAssetId === asset.id}
						<tr class="order-entry-row">
							<td colspan="6">
								<div class="order-entry">
									{#if orderError}
										<div class="error">{orderError}</div>
									{/if}
									<div class="order-form two-way">
										<label class="bid-size">
											Size
											<input
												type="number"
												bind:value={bidSize}
												placeholder="1"
												step="1"
												min="1"
												disabled={submittingOrder}
											/>
										</label>
										<label class="bid-price">
											Bid
											<input
												type="number"
												bind:value={bidPrice}
												placeholder="0.00"
												step="0.01"
												min="0"
												disabled={submittingOrder}
												class="bid-input"
											/>
										</label>
										<label class="offer-price">
											Offer
											<input
												type="number"
												bind:value={offerPrice}
												placeholder="0.00"
												step="0.01"
												min="0"
												disabled={submittingOrder}
												class="offer-input"
											/>
										</label>
										<label class="offer-size">
											Size
											<input
												type="number"
												bind:value={offerSize}
												placeholder="1"
												step="1"
												min="1"
												disabled={submittingOrder}
											/>
										</label>
										<button
											class="submit-btn"
											on:click={submitOrders}
											disabled={!canSubmit || submittingOrder}
										>
											{submittingOrder ? 'Submitting...' : 'Submit'}
										</button>
									</div>
								</div>
							</td>
						</tr>
					{/if}
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

	.create-asset-btn.small {
		margin-top: 0;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
	}

	.table-header {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.75rem;
	}

	.create-form {
		background: #0f0f0f;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 1.25rem;
	}

	.create-form h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		color: #fff;
	}

	.create-form label {
		display: block;
		margin-bottom: 0.75rem;
		font-size: 0.75rem;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.create-form input {
		display: block;
		width: 100%;
		padding: 0.625rem;
		margin-top: 0.375rem;
		border: 1px solid #333;
		border-radius: 6px;
		background: #1a1a1a;
		color: #fff;
		font-size: 0.875rem;
	}

	.create-form input:focus {
		outline: none;
		border-color: #6eb5ff;
	}

	.create-form input:disabled {
		opacity: 0.5;
	}

	.form-buttons {
		display: flex;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.form-buttons button {
		padding: 0.625rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.form-buttons button.primary {
		background: #2563eb;
		color: #fff;
		border: none;
	}

	.form-buttons button.primary:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.form-buttons button.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.form-buttons button.secondary {
		background: transparent;
		color: #888;
		border: 1px solid #333;
	}

	.form-buttons button.secondary:hover:not(:disabled) {
		border-color: #555;
		color: #aaa;
	}

	.error {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
		color: #ef4444;
		padding: 0.625rem;
		border-radius: 6px;
		margin-bottom: 0.75rem;
		font-size: 0.8125rem;
	}

	.asset-desc {
		display: block;
		font-size: 0.75rem;
		color: #666;
		max-width: 200px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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

	.expand-btn.active {
		background: #333;
		border-color: #555;
		color: #aaa;
	}

	tr.expanded td {
		border-bottom-color: transparent;
	}

	.order-entry-row td {
		padding: 0;
		border-bottom: 1px solid #222;
	}

	.order-entry {
		background: #0f0f0f;
		padding: 1rem;
		border-radius: 0 0 8px 8px;
		margin: 0 0.5rem 0.5rem 0.5rem;
	}

	.order-form {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.order-form.two-way {
		justify-content: center;
	}

	.order-form label {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.order-form input {
		width: 80px;
		padding: 0.5rem;
		border: 1px solid #333;
		border-radius: 6px;
		background: #1a1a1a;
		color: #fff;
		font-size: 0.875rem;
		text-align: center;
	}

	.order-form input:focus {
		outline: none;
		border-color: #6eb5ff;
	}

	.order-form input:disabled {
		opacity: 0.5;
	}

	.order-form .bid-input {
		border-color: #14532d;
	}

	.order-form .bid-input:focus {
		border-color: #4ade80;
	}

	.order-form .offer-input {
		border-color: #7f1d1d;
	}

	.order-form .offer-input:focus {
		border-color: #f87171;
	}

	.order-form .bid-price {
		color: #4ade80;
	}

	.order-form .offer-price {
		color: #f87171;
	}

	.submit-btn {
		padding: 0.5rem 1.25rem;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.15s ease;
		background: #2563eb;
		color: #fff;
	}

	.submit-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
