<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { supabase } from '$lib/supabase';
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

	$: isOwnOrders = selectedParticipantId === participantId;

	// Filter to selected participant's open orders
	$: filteredOrders = orders
		.filter((o) => o.participant_id === selectedParticipantId && o.status === 'open' && o.remaining_size > 0)
		.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

	function getAssetName(assetId: string): string {
		return assets.find((a) => a.id === assetId)?.name ?? 'Unknown';
	}

	async function cancelAllOrders() {
		cancellingAll = true;
		cancelError = '';
		try {
			const ids = filteredOrders.map((o) => o.id);
			const { error, data: deleted } = await supabase
				.from('orders')
				.delete()
				.in('id', ids)
				.select('id');

			if (error) throw error;

			if (!deleted || deleted.length === 0) {
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
			const { error, data: deleted } = await supabase
				.from('orders')
				.delete()
				.eq('id', order.id)
				.select('id');

			if (error) throw error;

			if (!deleted || deleted.length === 0) {
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
	{#if participants.length > 1}
		<div class="participant-selector">
			<select bind:value={selectedParticipantId}>
				{#each participants as p}
					<option value={p.id}>{p.id === participantId ? `${p.name} (You)` : p.name}</option>
				{/each}
			</select>
		</div>
	{/if}
	{#if cancelError}
		<div class="cancel-error">{cancelError}</div>
	{/if}
	{#if filteredOrders.length === 0}
		<p class="empty">No active orders.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Asset</th>
					<th>Side</th>
					<th>Size</th>
					<th>Price</th>
					{#if isOwnOrders}
						<th>
							<button
								class="cancel-all-btn"
								on:click={cancelAllOrders}
								disabled={cancellingAll}
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
					<tr>
						<td class="asset-name">{getAssetName(order.asset_id)}</td>
						<td class:bid={order.side === 'buy'} class:ask={order.side === 'sell'}>
							{order.side === 'buy' ? 'BID' : 'OFFER'}
						</td>
						<td>{order.remaining_size}</td>
						<td class="price">{order.price}</td>
						<td class="cancel-col">
							{#if isOwnOrders}
								<button
									class="cancel-btn"
									on:click={() => cancelOrder(order)}
									disabled={cancelling === order.id}
								>
									{cancelling === order.id ? '...' : '✕'}
								</button>
							{/if}
						</td>
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

	.participant-selector {
		margin-bottom: 0.5rem;
		text-align: right;
	}

	.participant-selector select {
		background: #0a1020;
		border: 1px solid #243254;
		color: #8498b5;
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		font-family: inherit;
	}

	.participant-selector select:focus {
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

	.cancel-col {
		text-align: right;
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

	@media (max-width: 600px) {
		th, td {
			padding: 0.25rem 0.375rem;
			font-size: 0.75rem;
		}
	}
</style>
