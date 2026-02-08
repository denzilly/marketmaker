<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { matchOrder } from '$lib/utils/order-matching';
	import type { Asset, Order, OrderSide } from '$lib/types/database';

	export let assets: Asset[] = [];
	export let orders: Order[] = [];
	export let marketId: string;
	export let participantId: string;
	export let isAdmin: boolean = false;

	const dispatch = createEventDispatcher();

	// Asset creation form state
	let showCreateForm = false;
	let newAssetName = '';
	let newAssetDescription = '';
	let creating = false;
	let createError = '';

	// Settlement state
	let settlingAssetId: string | null = null;
	let settlementValue = '';
	let submittingSettlement = false;
	let settlementError = '';

	// Order entry state (two-way pricing)
	let orderEntryAssetId: string | null = null;
	let bidSize = '';
	let bidPrice = '';
	let offerPrice = '';
	let offerSize = '';
	let submittingOrder = false;
	let orderError = '';

	// Depth view state
	let depthAssetId: string | null = null;

	// Instant trade state
	let tradingAssetId: string | null = null;

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

			dispatch('assetCreated', asset);

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

	function openSettlement(assetId: string) {
		orderEntryAssetId = null;
		settlingAssetId = assetId;
		settlementValue = '';
		settlementError = '';
	}

	function cancelSettlement() {
		settlingAssetId = null;
		settlementValue = '';
		settlementError = '';
	}

	async function submitSettlement() {
		if (settlingAssetId === null) return;

		const value = parseFloat(settlementValue);
		if (isNaN(value)) {
			settlementError = 'Settlement value must be a number';
			return;
		}
		if (Math.round(value * 10) !== value * 10) {
			settlementError = 'Max 1 decimal place';
			return;
		}

		submittingSettlement = true;
		settlementError = '';

		try {
			const { data: updatedAsset, error: assetError } = await supabase
				.from('assets')
				.update({
					status: 'settled',
					settlement_value: value,
					settled_at: new Date().toISOString()
				})
				.eq('id', settlingAssetId)
				.select()
				.single();

			if (assetError) throw assetError;

			const { error: deleteError } = await supabase
				.from('orders')
				.delete()
				.eq('asset_id', settlingAssetId)
				.eq('status', 'open');

			if (deleteError) {
				console.error('Failed to delete orders after settlement:', deleteError);
			}

			dispatch('assetSettled', updatedAsset);

			settlingAssetId = null;
			settlementValue = '';
		} catch (e) {
			settlementError = e instanceof Error ? e.message : 'Failed to settle asset';
		} finally {
			submittingSettlement = false;
		}
	}

	function toggleOrderEntry(assetId: string) {
		const asset = assets.find((a) => a.id === assetId);
		if (asset?.status === 'settled') return;

		if (orderEntryAssetId === assetId) {
			orderEntryAssetId = null;
		} else {
			orderEntryAssetId = assetId;
			bidSize = '';
			bidPrice = '';
			offerPrice = '';
			offerSize = '';
			orderError = '';
		}
	}

	function toggleDepth(assetId: string) {
		const asset = assets.find((a) => a.id === assetId);
		if (asset?.status === 'settled') return;

		depthAssetId = depthAssetId === assetId ? null : assetId;
	}

	// Instant trade: hit the bid (sell 1) or lift the offer (buy 1)
	async function instantTrade(assetId: string, side: OrderSide, price: number) {
		if (tradingAssetId) return;
		tradingAssetId = assetId;

		try {
			const { data: newOrder, error } = await supabase
				.from('orders')
				.insert({
					asset_id: assetId,
					participant_id: participantId,
					side,
					price,
					size: 1,
					remaining_size: 1
				})
				.select()
				.single();

			if (error) throw error;

			dispatch('orderCreated', newOrder);

			const result = await matchOrder(newOrder as Order, orders);

			for (const trade of result.trades) {
				dispatch('tradeExecuted', trade);
			}
			for (const updatedOrder of result.updatedOrders) {
				dispatch('orderUpdated', updatedOrder);
			}
			if (result.trades.length > 0) {
				const lastPrice = result.trades[result.trades.length - 1].price;
				dispatch('assetUpdated', { id: assetId, last_price: lastPrice });
			}
		} catch (e) {
			console.error('Instant trade failed:', e);
		} finally {
			tradingAssetId = null;
		}
	}

	async function submitOrders() {
		if (!orderEntryAssetId) return;

		const hasBid = bidPrice && bidSize;
		const hasOffer = offerPrice && offerSize;

		if (!hasBid && !hasOffer) {
			orderError = 'Enter at least one side (bid or offer)';
			return;
		}

		if (hasBid) {
			const price = parseFloat(bidPrice);
			const size = parseInt(bidSize, 10);
			if (isNaN(price)) { orderError = 'Bid price must be a number'; return; }
			if (Math.round(price * 10) !== price * 10) { orderError = 'Bid price: max 1 decimal place'; return; }
			if (isNaN(size) || size <= 0) { orderError = 'Bid size must be a positive integer'; return; }
		}

		if (hasOffer) {
			const price = parseFloat(offerPrice);
			const size = parseInt(offerSize, 10);
			if (isNaN(price)) { orderError = 'Offer price must be a number'; return; }
			if (Math.round(price * 10) !== price * 10) { orderError = 'Offer price: max 1 decimal place'; return; }
			if (isNaN(size) || size <= 0) { orderError = 'Offer size must be a positive integer'; return; }
		}

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
					asset_id: orderEntryAssetId,
					participant_id: participantId,
					side: 'buy' as OrderSide,
					price: parseFloat(bidPrice),
					size: parseInt(bidSize, 10),
					remaining_size: parseInt(bidSize, 10)
				});
			}

			if (hasOffer) {
				ordersToInsert.push({
					asset_id: orderEntryAssetId,
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

			for (const order of newOrders ?? []) {
				dispatch('orderCreated', order);

				const result = await matchOrder(order as Order, orders);

				for (const trade of result.trades) {
					dispatch('tradeExecuted', trade);
				}
				for (const updatedOrder of result.updatedOrders) {
					dispatch('orderUpdated', updatedOrder);
				}
				if (result.trades.length > 0) {
					const lastPrice = result.trades[result.trades.length - 1].price;
					dispatch('assetUpdated', { id: orderEntryAssetId, last_price: lastPrice });
				}
			}

			bidSize = '';
			bidPrice = '';
			offerPrice = '';
			offerSize = '';
			orderEntryAssetId = null;
		} catch (e) {
			orderError = e instanceof Error ? e.message : 'Failed to submit order';
		} finally {
			submittingOrder = false;
		}
	}

	$: canSubmit = (bidPrice && bidSize) || (offerPrice && offerSize);

	function depthBar(size: number, maxSize: number, side: 'bid' | 'ask'): string {
		const pct = (size / maxSize) * 100;
		const color = side === 'bid' ? '248,113,113' : '74,222,128';
		const dir = side === 'bid' ? 'to left' : 'to right';
		return `background: linear-gradient(${dir}, rgba(${color},0.18) ${pct}%, transparent ${pct}%)`;
	}

	function aggregateLevels(depthOrders: Order[]): { price: number; size: number }[] {
		const levels = new Map<number, number>();
		for (const o of depthOrders) {
			levels.set(o.price, (levels.get(o.price) ?? 0) + o.remaining_size);
		}
		return [...levels.entries()].map(([price, size]) => ({ price, size }));
	}

	// Group orders by asset
	$: ordersByAsset = [...assets].sort((a, b) => {
		if (a.status === 'settled' && b.status !== 'settled') return 1;
		if (a.status !== 'settled' && b.status === 'settled') return -1;
		return 0;
	}).map((asset) => {
		const assetOrders = orders.filter((o) => o.asset_id === asset.id && o.status === 'open');
		const bids = assetOrders
			.filter((o) => o.side === 'buy')
			.sort((a, b) => b.price - a.price);
		const asks = assetOrders
			.filter((o) => o.side === 'sell')
			.sort((a, b) => a.price - b.price);

		const bestBidPrice = bids[0]?.price ?? null;
		const bestAskPrice = asks[0]?.price ?? null;

		const topBidSize = bestBidPrice !== null
			? bids.filter((o) => o.price === bestBidPrice).reduce((s, o) => s + o.remaining_size, 0)
			: 0;
		const topAskSize = bestAskPrice !== null
			? asks.filter((o) => o.price === bestAskPrice).reduce((s, o) => s + o.remaining_size, 0)
			: 0;

		const depthBids = aggregateLevels(bids.filter((o) => o.price !== bestBidPrice));
		const depthAsks = aggregateLevels(asks.filter((o) => o.price !== bestAskPrice));
		const maxSize = Math.max(
			topBidSize,
			topAskSize,
			...depthBids.map((d) => d.size),
			...depthAsks.map((d) => d.size),
			1
		);

		return {
			asset,
			topBid: bids[0] ?? null,
			topBidSize,
			topAsk: asks[0] ?? null,
			topAskSize,
			bids,
			asks,
			depthBids,
			depthAsks,
			maxSize
		};
	});

	function getTooltip(asset: Asset): string {
		const parts = [];
		if (asset.description) parts.push(asset.description);
		if (asset.last_price !== null) parts.push(`Last: ${asset.last_price}`);
		if (asset.status === 'settled') parts.push(`Settled @ ${asset.settlement_value}`);
		return parts.join(' | ') || asset.name;
	}
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
					placeholder="e.g. Fred's quiz score"
					maxlength="50"
					disabled={creating}
				/>
			</label>
			<label>
				Description (optional)
				<input
					type="text"
					bind:value={newAssetDescription}
					placeholder="What is the payoff structure of this contract?"
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
		<table>
			<thead>
				<tr>
					<th class="asset-col">Asset</th>
					<th class="size-col">Size</th>
					<th class="bid-col">Bid</th>
					<th class="ask-col">Ask</th>
					<th class="size-col">Size</th>
					<th class="actions-col"></th>
				</tr>
			</thead>
			<tbody>
				{#each ordersByAsset as { asset, topBid, topBidSize, topAsk, topAskSize, depthBids, depthAsks, maxSize }}
					<tr
						class:has-sub-row={orderEntryAssetId === asset.id || depthAssetId === asset.id || settlingAssetId === asset.id}
						class:settled={asset.status === 'settled'}
					>
						<td class="asset-col">
							<span class="asset-name" title={getTooltip(asset)}>{asset.name}</span>
							{#if asset.status === 'settled'}
								<span class="settled-label">SETTLED @ {asset.settlement_value}</span>
							{/if}
						</td>

						{#if asset.status === 'settled'}
							<td colspan="4" class="settled-info">
								<span class="settled-value">{asset.settlement_value}</span>
							</td>
							<td class="actions-col"></td>
						{:else}
							<td class="size-col">{topBidSize || '-'}</td>
							<td class="bid-col">
								{#if topBid}
									{@const ownBid = topBid.participant_id === participantId}
									<button
										class="price-btn bid"
										class:own={ownBid}
										on:click={() => instantTrade(asset.id, 'sell', topBid.price)}
										disabled={tradingAssetId === asset.id || ownBid}
										title={ownBid ? 'Your bid' : `Sell 1 @ ${topBid.price}`}
									>
										{topBid.price}
									</button>
								{:else}
									<span class="no-price">-</span>
								{/if}
							</td>
							<td class="ask-col">
								{#if topAsk}
									{@const ownAsk = topAsk.participant_id === participantId}
									<button
										class="price-btn ask"
										class:own={ownAsk}
										on:click={() => instantTrade(asset.id, 'buy', topAsk.price)}
										disabled={tradingAssetId === asset.id || ownAsk}
										title={ownAsk ? 'Your offer' : `Buy 1 @ ${topAsk.price}`}
									>
										{topAsk.price}
									</button>
								{:else}
									<span class="no-price">-</span>
								{/if}
							</td>
							<td class="size-col">{topAskSize || '-'}</td>
							<td class="actions-col">
								{#if isAdmin}
									<button
										class="settle-btn"
										on:click={() => openSettlement(asset.id)}
										title="Settle this asset"
									>S</button>
								{/if}
								<button
									class="add-order-btn"
									on:click={() => toggleOrderEntry(asset.id)}
									class:active={orderEntryAssetId === asset.id}
									title="Add order"
								>+</button>
								{#if depthBids.length > 0 || depthAsks.length > 0 || depthAssetId === asset.id}
									<button
										class="depth-btn"
										on:click={() => toggleDepth(asset.id)}
										class:active={depthAssetId === asset.id}
										title="Show order book depth"
									>{depthAssetId === asset.id ? '▲' : '▼'}</button>
								{/if}
							</td>
						{/if}
					</tr>

					{#if depthAssetId === asset.id && asset.status !== 'settled'}
						{@const maxDepth = Math.max(depthBids.length, depthAsks.length)}
						{#if maxDepth === 0}
							<tr class="depth-row depth-last">
								<td class="asset-col"></td>
								<td colspan="4" class="depth-empty-msg">No additional orders</td>
								<td class="actions-col"></td>
							</tr>
						{:else}
							{#each Array(maxDepth) as _, i}
								<tr class="depth-row" class:depth-last={i === maxDepth - 1}>
									<td class="asset-col"></td>
									<td class="size-col">{depthBids[i]?.size ?? ''}</td>
									<td class="bid-col" style={depthBids[i] ? depthBar(depthBids[i].size, maxSize, 'bid') : ''}>
										{#if depthBids[i]}
											<span class="depth-price bid">{depthBids[i].price}</span>
										{/if}
									</td>
									<td class="ask-col" style={depthAsks[i] ? depthBar(depthAsks[i].size, maxSize, 'ask') : ''}>
										{#if depthAsks[i]}
											<span class="depth-price ask">{depthAsks[i].price}</span>
										{/if}
									</td>
									<td class="size-col">{depthAsks[i]?.size ?? ''}</td>
									<td class="actions-col"></td>
								</tr>
							{/each}
						{/if}
					{/if}

					{#if settlingAssetId === asset.id}
						<tr class="settlement-row">
							<td colspan="6">
								<div class="settlement-form">
									<h4>Settle "{asset.name}"</h4>
									<p class="settlement-hint">Enter the final outcome value. All open orders will be cancelled.</p>
									{#if settlementError}
										<div class="error">{settlementError}</div>
									{/if}
									<div class="settlement-inputs">
										<label>
											Settlement Value
											<input
												type="number"
												bind:value={settlementValue}
												placeholder="0.0"
												step="0.1"
												disabled={submittingSettlement}
											/>
										</label>
										<button
											class="primary"
											on:click={submitSettlement}
											disabled={!settlementValue || submittingSettlement}
										>
											{submittingSettlement ? 'Settling...' : 'Confirm Settlement'}
										</button>
										<button
											class="secondary"
											on:click={cancelSettlement}
											disabled={submittingSettlement}
										>
											Cancel
										</button>
									</div>
								</div>
							</td>
						</tr>
					{/if}

					{#if orderEntryAssetId === asset.id}
						<tr class="order-entry-row">
							<td colspan="6">
								<div class="order-entry">
									{#if orderError}
										<div class="error">{orderError}</div>
									{/if}
									<!-- svelte-ignore a11y-no-static-element-interactions -->
								<div class="order-form two-way" on:keydown={(e) => { if (e.key === 'Enter' && canSubmit && !submittingOrder) submitOrders(); }}>
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
												placeholder="0.0"
												step="0.1"
												disabled={submittingOrder}
												class="bid-input"
											/>
										</label>
										<label class="offer-price">
											Offer
											<input
												type="number"
												bind:value={offerPrice}
												placeholder="0.0"
												step="0.1"
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
		<div class="table-footer">
			<button class="create-asset-btn small" on:click={() => (showCreateForm = true)}>+ New Asset</button>
		</div>
	{/if}
</div>

<style>
	.orderbook {
		width: 100%;
		overflow-x: auto;
	}

	.empty {
		text-align: center;
		padding: 2rem;
		color: #607a9c;
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
		padding: 0.375rem 1rem;
		font-size: 0.75rem;
		width: 100%;
		background: transparent;
		border: 1px solid #243254;
		color: #adc5e4;
	}

	.create-asset-btn.small:hover {
		border-color: #3d5078;
		color: #8498b5;
		background: transparent;
	}

	.table-footer {
		margin-top: 0.5rem;
	}

	.create-form {
		background: #0a1020;
		border: 1px solid #243254;
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
		color: #607a9c;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.create-form input {
		display: block;
		width: 100%;
		padding: 0.625rem;
		margin-top: 0.375rem;
		border: 1px solid #243254;
		border-radius: 6px;
		background: #111b2e;
		color: #fff;
		font-size: 0.875rem;
	}

	.create-form input:focus {
		outline: none;
		border-color: #7ec8ff;
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
		color: #607a9c;
		border: 1px solid #243254;
	}

	.form-buttons button.secondary:hover:not(:disabled) {
		border-color: #3d5078;
		color: #8498b5;
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
		color: #435a80;
		border-bottom: 1px solid #243254;
	}

	td {
		padding: 0.75rem 0.5rem;
		border-bottom: 1px solid #1a2744;
	}

	.asset-col {
		min-width: 120px;
	}

	.asset-name {
		display: block;
		font-weight: 500;
		color: #fff;
		cursor: default;
	}

	.bid-col,
	.ask-col {
		width: 100px;
	}

	.bid-col {
		text-align: right;
		padding-right: 4px;
	}

	.ask-col {
		text-align: left;
		padding-left: 4px;
	}

	.size-col {
		width: 40px;
		color: #8498b5;
		font-size: 0.875rem;
		text-align: center;
		padding-left: 0;
		padding-right: 0;
		border-left: 1px solid #243254;
		border-right: 1px solid #243254;
	}

	.actions-col {
		width: 80px;
		white-space: nowrap;
	}

	.price-btn {
		padding: 0.375rem 0;
		width: 70%;
		border: none;
		border-radius: 4px;
		font-weight: 500;
		font-size: 0.875rem;
		cursor: pointer;
	}

	.price-btn:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	.price-btn.own {
		opacity: 1;
		cursor: default;
		outline: 1.5px solid currentColor;
		outline-offset: -1.5px;
		background: transparent;
	}

	.price-btn.bid {
		background: #7f1d1d;
		color: #f87171;
	}

	.price-btn.bid:hover:not(:disabled) {
		background: #991b1b;
	}

	.price-btn.ask {
		background: #14532d;
		color: #4ade80;
	}

	.price-btn.ask:hover:not(:disabled) {
		background: #166534;
	}

	.no-price {
		color: #2e3e66;
	}

	/* Action buttons */
	.add-order-btn,
	.depth-btn {
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: 1px solid #3d5078;
		border-radius: 4px;
		color: #8498b5;
		font-size: 0.75rem;
		margin-left: 0.125rem;
	}

	.add-order-btn:hover,
	.depth-btn:hover {
		border-color: #5a7aad;
		color: #c5d0e3;
	}

	.add-order-btn.active {
		background: #2563eb;
		border-color: #2563eb;
		color: #fff;
	}

	.depth-btn.active {
		background: #243254;
		border-color: #3d5078;
		color: #8498b5;
	}

	tr.has-sub-row td {
		border-bottom-color: transparent;
	}

	/* Settled */
	tr.settled td {
		opacity: 0.7;
	}

	.settled-label {
		display: block;
		font-size: 0.75rem;
		color: #fbbf24;
		font-weight: 500;
	}

	.settled-info {
		text-align: center;
		color: #fbbf24;
		font-size: 0.875rem;
	}

	.settled-value {
		font-weight: 600;
	}

	.settle-btn {
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: 1px solid #fbbf24;
		border-radius: 4px;
		color: #fbbf24;
		font-size: 0.75rem;
		font-weight: 600;
		margin-left: 0.125rem;
	}

	.settle-btn:hover {
		background: rgba(251, 191, 36, 0.15);
	}

	/* Depth rows */
	.depth-row td {
		padding: 0.25rem 0.5rem;
		border-bottom: none;
	}

	.depth-row .size-col {
		padding: 0.25rem 0;
	}

	.depth-row .bid-col {
		padding-top: 0.25rem;
		padding-bottom: 0.25rem;
	}

	.depth-row .ask-col {
		padding-top: 0.25rem;
		padding-bottom: 0.25rem;
	}

	.depth-row.depth-last td {
		border-bottom: 1px solid #1a2744;
	}

	.depth-price {
		font-weight: 500;
		font-size: 0.8125rem;
	}

	.depth-price.bid {
		color: #f87171;
	}

	.depth-price.ask {
		color: #4ade80;
	}

	.depth-empty-msg {
		text-align: center;
		color: #2e3e66;
		font-size: 0.75rem;
		font-style: italic;
		padding: 0.375rem;
	}

	/* Settlement form */
	.settlement-row td {
		padding: 0;
		border-bottom: 1px solid #1a2744;
	}

	.settlement-form {
		background: #0a1020;
		padding: 1rem;
		border-radius: 0 0 8px 8px;
		margin: 0 0.5rem 0.5rem 0.5rem;
		border: 1px solid #fbbf24;
		border-top: none;
	}

	.settlement-form h4 {
		margin: 0 0 0.5rem 0;
		color: #fbbf24;
		font-size: 0.9375rem;
	}

	.settlement-hint {
		margin: 0 0 0.75rem 0;
		color: #607a9c;
		font-size: 0.8125rem;
	}

	.settlement-inputs {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.settlement-inputs label {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: #607a9c;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.settlement-inputs input {
		width: 120px;
		padding: 0.5rem;
		border: 1px solid #fbbf24;
		border-radius: 6px;
		background: #111b2e;
		color: #fff;
		font-size: 0.875rem;
		text-align: center;
	}

	.settlement-inputs input:focus {
		outline: none;
		border-color: #fbbf24;
		box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.3);
	}

	.settlement-inputs button.primary {
		padding: 0.5rem 1rem;
		background: #fbbf24;
		color: #000;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.settlement-inputs button.primary:hover:not(:disabled) {
		background: #f59e0b;
	}

	.settlement-inputs button.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.settlement-inputs button.secondary {
		padding: 0.5rem 1rem;
		background: transparent;
		color: #607a9c;
		border: 1px solid #243254;
		border-radius: 6px;
		font-size: 0.875rem;
	}

	.settlement-inputs button.secondary:hover:not(:disabled) {
		border-color: #3d5078;
		color: #8498b5;
	}

	/* Order entry */
	.order-entry-row td {
		padding: 0;
		border-bottom: 1px solid #1a2744;
	}

	.order-entry {
		background: #0a1020;
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
		color: #607a9c;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.order-form input {
		width: 80px;
		padding: 0.5rem;
		border: 1px solid #243254;
		border-radius: 6px;
		background: #111b2e;
		color: #fff;
		font-size: 0.875rem;
		text-align: center;
		-moz-appearance: textfield;
		appearance: textfield;
	}

	.order-form input::-webkit-inner-spin-button,
	.order-form input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		appearance: none;
		margin: 0;
	}

	.order-form input:focus {
		outline: none;
		border-color: #7ec8ff;
	}

	.order-form input:disabled {
		opacity: 0.5;
	}

	.order-form .bid-input {
		border-color: #7f1d1d;
	}

	.order-form .bid-input:focus {
		border-color: #f87171;
	}

	.order-form .offer-input {
		border-color: #14532d;
	}

	.order-form .offer-input:focus {
		border-color: #4ade80;
	}

	.order-form .bid-price {
		color: #f87171;
	}

	.order-form .offer-price {
		color: #4ade80;
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

	@media (max-width: 600px) {
		table {
			font-size: 0.75rem;
		}

		td {
			padding: 0.5rem 0.25rem;
		}

		th {
			padding: 0.375rem 0.25rem;
		}

		.asset-col {
			min-width: 80px;
		}

		.bid-col,
		.ask-col {
			width: 70px;
		}

		.size-col {
			width: 30px;
			font-size: 0.75rem;
		}

		.actions-col {
			width: 60px;
		}

		.price-btn {
			width: 90%;
			font-size: 0.75rem;
			padding: 0.25rem 0;
		}

		.add-order-btn,
		.depth-btn,
		.settle-btn {
			padding: 0.2rem 0.375rem;
			font-size: 0.6875rem;
		}

		.order-form {
			gap: 0.5rem;
		}

		.order-form input {
			width: 60px;
			padding: 0.375rem;
			font-size: 0.75rem;
		}

		.order-form label {
			font-size: 0.625rem;
		}

		.submit-btn {
			padding: 0.375rem 0.75rem;
			font-size: 0.75rem;
		}

		.settlement-inputs {
			flex-direction: column;
			align-items: stretch;
		}

		.settlement-inputs input {
			width: 100%;
		}
	}
</style>
