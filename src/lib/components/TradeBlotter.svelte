<script lang="ts">
	import type { TradeWithParticipants } from '$lib/types/database';

	// TODO: Replace with real data from Supabase store
	let trades: TradeWithParticipants[] = [];

	function formatTime(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="trade-blotter">
	{#if trades.length === 0}
		<p class="empty">No trades yet.</p>
	{:else}
		<ul>
			{#each trades as trade}
				<li>
					<div class="trade-header">
						<span class="asset">{trade.asset.name}</span>
						<span class="time">{formatTime(trade.executed_at)}</span>
					</div>
					<div class="trade-details">
						<span class="buyer">{trade.buyer.name}</span>
						<span class="action">bought</span>
						<span class="size">{trade.size}</span>
						<span class="at">@</span>
						<span class="price">{trade.price}</span>
						<span class="from">from</span>
						<span class="seller">{trade.seller.name}</span>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.trade-blotter {
		flex: 1;
		overflow-y: auto;
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
		padding: 0.75rem;
		border-bottom: 1px solid #222;
	}

	li:last-child {
		border-bottom: none;
	}

	.trade-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.25rem;
	}

	.asset {
		font-weight: 500;
		color: #fff;
		font-size: 0.875rem;
	}

	.time {
		color: #666;
		font-size: 0.75rem;
	}

	.trade-details {
		font-size: 0.8125rem;
		color: #888;
	}

	.buyer {
		color: #4ade80;
	}

	.seller {
		color: #f87171;
	}

	.price {
		color: #fff;
		font-weight: 500;
	}

	.size {
		color: #6eb5ff;
	}

	.action,
	.at,
	.from {
		color: #666;
	}
</style>
