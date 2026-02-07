<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { supabase } from '$lib/supabase';
	import type { Asset, Order } from '$lib/types/database';

	export let orders: Order[] = [];
	export let assets: Asset[] = [];
	export let participantId: string;

	const dispatch = createEventDispatcher();

	let cancelling: string | null = null;
	let cancellingAll = false;

	// Filter to only this user's open orders
	$: myOrders = orders
		.filter((o) => o.participant_id === participantId && o.status === 'open' && o.remaining_size > 0)
		.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

	function getAssetName(assetId: string): string {
		return assets.find((a) => a.id === assetId)?.name ?? 'Unknown';
	}

	async function cancelAllOrders() {
		cancellingAll = true;
		try {
			const ids = myOrders.map((o) => o.id);
			const { error } = await supabase
				.from('orders')
				.delete()
				.in('id', ids);

			if (error) throw error;

			for (const order of myOrders) {
				dispatch('orderCancelled', order);
			}
		} catch (e) {
			console.error('Failed to cancel all orders:', e);
		} finally {
			cancellingAll = false;
		}
	}

	async function cancelOrder(order: Order) {
		cancelling = order.id;
		try {
			const { error } = await supabase
				.from('orders')
				.delete()
				.eq('id', order.id);

			if (error) throw error;

			dispatch('orderCancelled', order);
		} catch (e) {
			console.error('Failed to cancel order:', e);
		} finally {
			cancelling = null;
		}
	}
</script>

<div class="active-orders">
	{#if myOrders.length === 0}
		<p class="empty">No active orders.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Asset</th>
					<th>Side</th>
					<th>Size</th>
					<th>Price</th>
					<th>
						<button
							class="cancel-all-btn"
							on:click={cancelAllOrders}
							disabled={cancellingAll}
						>
							{cancellingAll ? '...' : 'Cancel All'}
						</button>
					</th>
				</tr>
			</thead>
			<tbody>
				{#each myOrders as order}
					<tr>
						<td class="asset-name">{getAssetName(order.asset_id)}</td>
						<td class:bid={order.side === 'buy'} class:ask={order.side === 'sell'}>
							{order.side === 'buy' ? 'BID' : 'OFFER'}
						</td>
						<td>{order.remaining_size}</td>
						<td class="price">{order.price}</td>
						<td class="cancel-col">
							<button
								class="cancel-btn"
								on:click={() => cancelOrder(order)}
								disabled={cancelling === order.id}
							>
								{cancelling === order.id ? '...' : '✕'}
							</button>
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

	.empty {
		color: #435a80;
		text-align: center;
		padding: 1rem;
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
</style>
