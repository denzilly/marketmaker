<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { matchOrder } from '$lib/utils/order-matching';
	import type { Asset, Order } from '$lib/types/database';

	export let orders: Order[] = [];
	export let assets: Asset[] = [];
	export let participantId: string;
	export let participants: Array<{ id: string; name: string }> = [];

	const dispatch = createEventDispatcher();

	let cancelling: string | null = null;
	let cancellingAll = false;
	let cancelError = '';
	let selectedParticipantId: string = participantId;
	const ALL_FILTER = '__all__';

	let editingOrderId: string | null = null;
	let editPrice = '';
	let editSize = '';
	let amending = false;
	let amendError = '';

	$: isOwnOrders = selectedParticipantId === participantId;
	$: isAllOrders = selectedParticipantId === ALL_FILTER;

	// Filter to selected participant's open orders (or all)
	$: filteredOrders = orders
		.filter((o) => (isAllOrders || o.participant_id === selectedParticipantId) && o.status === 'open' && o.remaining_size > 0)
		.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

	// Auto-close edit if the order being edited gets filled/cancelled via real-time
	$: if (editingOrderId) {
		const editedOrder = orders.find((o) => o.id === editingOrderId);
		if (!editedOrder || editedOrder.status !== 'open' || editedOrder.remaining_size <= 0) {
			editingOrderId = null;
			editPrice = '';
			editSize = '';
			amendError = '';
		}
	}

	function getAssetName(assetId: string): string {
		return assets.find((a) => a.id === assetId)?.name ?? 'Unknown';
	}

	function getParticipantName(pid: string): string {
		return participants.find((p) => p.id === pid)?.name ?? 'Unknown';
	}

	function startAmend(order: Order) {
		editingOrderId = order.id;
		editPrice = String(order.price);
		editSize = String(order.remaining_size);
		amendError = '';
	}

	function cancelAmend() {
		editingOrderId = null;
		editPrice = '';
		editSize = '';
		amendError = '';
	}

	async function submitAmend(order: Order) {
		const newPrice = parseFloat(editPrice);
		const newSize = parseInt(editSize, 10);

		if (isNaN(newPrice) || newPrice <= 0) { amendError = 'Price must be a positive number'; return; }
		if (isNaN(newSize) || newSize <= 0) { amendError = 'Size must be a positive integer'; return; }

		// No change — just close
		if (newPrice === order.price && newSize === order.remaining_size) {
			cancelAmend();
			return;
		}

		amending = true;
		amendError = '';

		try {
			const updatePayload: Record<string, any> = {
				price: newPrice,
				remaining_size: newSize
			};

			// Price change resets queue priority
			if (newPrice !== order.price) {
				updatePayload.created_at = new Date().toISOString();
			}

			// If new remaining exceeds original size, bump size to keep size >= remaining
			const alreadyFilled = order.size - order.remaining_size;
			if (newSize + alreadyFilled > order.size) {
				updatePayload.size = newSize + alreadyFilled;
			}

			const { error, data: updated } = await supabase
				.from('orders')
				.update(updatePayload)
				.eq('id', order.id)
				.eq('status', 'open')
				.select()
				.single();

			if (error) throw error;

			if (!updated) {
				amendError = 'Order may have already been filled or cancelled.';
				return;
			}

			dispatch('orderAmended', updated);

			// Re-match to check for crosses at the new price
			const result = await matchOrder(order.id);

			for (const trade of result.trades) {
				dispatch('tradeExecuted', trade);
			}
			for (const updatedOrder of result.updatedOrders) {
				dispatch('orderUpdated', updatedOrder);
			}
			if (result.trades.length > 0) {
				const lastPrice = result.trades[result.trades.length - 1].price;
				dispatch('assetUpdated', { id: order.asset_id, last_price: lastPrice });
			}

			cancelAmend();
		} catch (e) {
			console.error('Failed to amend order:', e);
			amendError = 'Failed to amend order. It may have been filled or cancelled.';
		} finally {
			amending = false;
		}
	}

	async function cancelAllOrders() {
		cancellingAll = true;
		cancelError = '';
		try {
			const ids = filteredOrders.map((o) => o.id);
			const { error, data: updated } = await supabase
				.from('orders')
				.update({ status: 'cancelled', remaining_size: 0 })
				.in('id', ids)
				.eq('status', 'open')
				.select('id');

			if (error) throw error;

			if (!updated || updated.length === 0) {
				cancelError = 'Orders may have already been filled or cancelled.';
			}

			for (const order of filteredOrders) {
				dispatch('orderCancelled', order);
			}
		} catch (e) {
			console.error('Failed to cancel all orders:', e);
			cancelError = 'Failed to cancel orders. Try refreshing the page.';
		} finally {
			cancellingAll = false;
		}
	}

	async function cancelOrder(order: Order) {
		cancelling = order.id;
		cancelError = '';
		try {
			const { error, data: updated } = await supabase
				.from('orders')
				.update({ status: 'cancelled', remaining_size: 0 })
				.eq('id', order.id)
				.eq('status', 'open')
				.select('id');

			if (error) throw error;

			if (!updated || updated.length === 0) {
				cancelError = 'Order may have already been filled or cancelled.';
			}

			// Remove from local state either way
			dispatch('orderCancelled', order);
		} catch (e) {
			console.error('Failed to cancel order:', e);
			cancelError = 'Failed to cancel order. Try refreshing the page.';
		} finally {
			cancelling = null;
		}
	}
</script>

<div class="active-orders">
	<div class="section-header">
		<h2>Orders</h2>
		{#if participants.length > 1}
			<select bind:value={selectedParticipantId}>
				{#each participants as p}
					<option value={p.id}>{p.id === participantId ? `${p.name} (You)` : p.name}</option>
				{/each}
				<option value={ALL_FILTER}>All</option>
			</select>
		{/if}
	</div>
	{#if cancelError}
		<div class="cancel-error">{cancelError}</div>
	{/if}
	{#if amendError}
		<div class="cancel-error">{amendError}</div>
	{/if}
	{#if filteredOrders.length === 0}
		<p class="empty">No active orders.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Asset</th>
					{#if isAllOrders}<th>Player</th>{/if}
					<th>Side</th>
					<th>Size</th>
					<th>Price</th>
					{#if isOwnOrders}
						<th>
							<button
								class="cancel-all-btn"
								on:click={cancelAllOrders}
								disabled={cancellingAll || editingOrderId !== null}
							>
								{cancellingAll ? '...' : 'Cancel All'}
							</button>
						</th>
					{:else}
						<th></th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#each filteredOrders as order}
					<tr class:editing={editingOrderId === order.id}>
						<td class="asset-name">{getAssetName(order.asset_id)}</td>
						{#if isAllOrders}<td class="player-name">{getParticipantName(order.participant_id)}</td>{/if}
						<td class:bid={order.side === 'buy'} class:ask={order.side === 'sell'}>
							{order.side === 'buy' ? 'BID' : 'OFFER'}
						</td>

						{#if editingOrderId === order.id}
							<td>
								<input
									type="number"
									class="edit-input"
									bind:value={editSize}
									min="1"
									step="1"
									disabled={amending}
								/>
							</td>
							<td>
								<input
									type="number"
									class="edit-input"
									bind:value={editPrice}
									step="0.1"
									disabled={amending}
									on:keydown={(e) => { if (e.key === 'Enter') submitAmend(order); if (e.key === 'Escape') cancelAmend(); }}
								/>
							</td>
							<td class="action-col">
								<button
									class="save-btn"
									on:click={() => submitAmend(order)}
									disabled={amending}
								>
									{amending ? '...' : 'OK'}
								</button>
								<button
									class="cancel-edit-btn"
									on:click={cancelAmend}
									disabled={amending}
								>
									✕
								</button>
							</td>
						{:else}
							<td>{order.remaining_size}</td>
							<td class="price">{order.price}</td>
							<td class="action-col">
								{#if isOwnOrders}
									<button
										class="amend-btn"
										on:click={() => startAmend(order)}
										disabled={cancelling === order.id || editingOrderId !== null}
										title="Amend order"
									>
										✎
									</button>
									<button
										class="cancel-btn"
										on:click={() => cancelOrder(order)}
										disabled={cancelling === order.id || editingOrderId !== null}
									>
										{cancelling === order.id ? '...' : '✕'}
									</button>
								{/if}
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.active-orders {
		width: 100%;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.section-header h2 {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #607a9c;
		margin: 0;
	}

	.section-header select {
		background: #0a1020;
		border: 1px solid #243254;
		color: #8498b5;
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		font-family: inherit;
	}

	.section-header select:focus {
		outline: none;
		border-color: #7ec8ff;
	}

	.empty {
		color: #435a80;
		text-align: center;
		padding: 1rem;
	}

	.cancel-error {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
		color: #ef4444;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
		font-size: 0.8125rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		text-align: center;
		padding: 0.375rem 0.5rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #435a80;
		border-bottom: 1px solid #243254;
		font-weight: 500;
	}

	th:last-child {
		text-align: right;
	}

	td {
		padding: 0.375rem 0.5rem;
		font-size: 0.8125rem;
		border-bottom: 1px solid #1a2744;
		color: #607a9c;
		text-align: center;
	}

	tr:last-child td {
		border-bottom: none;
	}

	.asset-name {
		color: #fff;
		font-weight: 500;
	}

	.player-name {
		color: #8498b5;
	}

	.bid {
		color: #f87171;
		font-weight: 600;
	}

	.ask {
		color: #4ade80;
		font-weight: 600;
	}

	.price {
		color: #fff;
	}

	.cancel-all-btn {
		padding: 0.125rem 0.5rem;
		background: transparent;
		border: 1px solid #2e3e66;
		border-radius: 4px;
		color: #607a9c;
		font-size: 0.6875rem;
	}

	.cancel-all-btn:hover:not(:disabled) {
		border-color: #ef4444;
		color: #ef4444;
	}

	.cancel-all-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-col {
		text-align: right;
		white-space: nowrap;
	}

	.cancel-btn {
		padding: 0.125rem 0.375rem;
		background: transparent;
		border: 1px solid #2e3e66;
		border-radius: 4px;
		color: #607a9c;
		font-size: 0.75rem;
		line-height: 1;
	}

	.cancel-btn:hover:not(:disabled) {
		border-color: #ef4444;
		color: #ef4444;
	}

	.cancel-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.amend-btn {
		padding: 0.125rem 0.375rem;
		background: transparent;
		border: 1px solid #2e3e66;
		border-radius: 4px;
		color: #607a9c;
		font-size: 0.75rem;
		line-height: 1;
		margin-right: 0.25rem;
	}

	.amend-btn:hover:not(:disabled) {
		border-color: #7ec8ff;
		color: #7ec8ff;
	}

	.amend-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.edit-input {
		width: 60px;
		padding: 0.25rem 0.375rem;
		border: 1px solid #7ec8ff;
		border-radius: 4px;
		background: #0a1020;
		color: #fff;
		font-size: 0.8125rem;
		font-family: inherit;
		text-align: center;
		-moz-appearance: textfield;
		appearance: textfield;
	}

	.edit-input::-webkit-inner-spin-button,
	.edit-input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		appearance: none;
		margin: 0;
	}

	.edit-input:focus {
		outline: none;
		border-color: #7ec8ff;
		box-shadow: 0 0 0 1px rgba(126, 200, 255, 0.3);
	}

	.edit-input:disabled {
		opacity: 0.5;
	}

	.save-btn {
		padding: 0.125rem 0.375rem;
		background: #2563eb;
		border: none;
		border-radius: 4px;
		color: #fff;
		font-size: 0.75rem;
		line-height: 1;
		margin-right: 0.25rem;
	}

	.save-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.cancel-edit-btn {
		padding: 0.125rem 0.375rem;
		background: transparent;
		border: 1px solid #2e3e66;
		border-radius: 4px;
		color: #607a9c;
		font-size: 0.75rem;
		line-height: 1;
	}

	.cancel-edit-btn:hover:not(:disabled) {
		border-color: #ef4444;
		color: #ef4444;
	}

	.cancel-edit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	tr.editing td {
		background: rgba(126, 200, 255, 0.05);
	}

	@media (max-width: 600px) {
		th, td {
			padding: 0.25rem 0.375rem;
			font-size: 0.75rem;
		}

		.edit-input {
			width: 48px;
			padding: 0.2rem 0.25rem;
			font-size: 0.75rem;
		}
	}
</style>
