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
		<div class="header-row">
			<button
				class="cancel-all-btn"
				on:click={cancelAllOrders}
				disabled={cancellingAll}
			>
				{cancellingAll ? 'Cancelling...' : 'Cancel All'}
			</button>
		</div>
		<ul>
			{#each myOrders as order}
				<li>
					<div class="order-info">
						<span class="asset-name">{getAssetName(order.asset_id)}</span>
						<span class="order-detail">
							<span class:bid={order.side === 'buy'} class:ask={order.side === 'sell'}>
								{order.side === 'buy' ? 'BID' : 'OFFER'}
							</span>
							<span class="size">{order.remaining_size}</span>
							<span class="at">@</span>
							<span class="price">{order.price}</span>
						</span>
					</div>
					<button
						class="cancel-btn"
						on:click={() => cancelOrder(order)}
						disabled={cancelling === order.id}
					>
						{cancelling === order.id ? '...' : '✕'}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.active-orders {
		width: 100%;
	}

	.empty {
		color: #666;
		text-align: center;
		padding: 1rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem;
		border-bottom: 1px solid #222;
	}

	li:last-child {
		border-bottom: none;
	}

	.order-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.asset-name {
		font-size: 0.8125rem;
		color: #fff;
		font-weight: 500;
	}

	.order-detail {
		font-size: 0.75rem;
		color: #888;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.bid {
		color: #4ade80;
		font-weight: 600;
	}

	.ask {
		color: #f87171;
		font-weight: 600;
	}

	.price {
		color: #fff;
	}

	.at {
		color: #555;
	}

	.header-row {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.5rem;
	}

	.cancel-all-btn {
		padding: 0.25rem 0.75rem;
		background: transparent;
		border: 1px solid #444;
		border-radius: 4px;
		color: #888;
		font-size: 0.75rem;
	}

	.cancel-all-btn:hover:not(:disabled) {
		border-color: #ef4444;
		color: #ef4444;
	}

	.cancel-all-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.cancel-btn {
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: 1px solid #444;
		border-radius: 4px;
		color: #888;
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
