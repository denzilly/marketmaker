<script lang="ts">
	import type { Asset } from '$lib/types/database';

	interface TradeData {
		id: string;
		asset_id: string;
		buyer_id: string;
		seller_id: string;
		price: number;
		size: number;
		executed_at: string;
	}

	export let trades: TradeData[] = [];
	export let assets: Asset[] = [];
	export let participants: Array<{ id: string; name: string }> = [];

	function getAssetName(assetId: string): string {
		return assets.find((a) => a.id === assetId)?.name ?? 'Unknown';
	}

	function getParticipantName(participantId: string): string {
		return participants.find((p) => p.id === participantId)?.name ?? 'Unknown';
	}

	function formatTime(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="trade-blotter">
	{#if trades.length === 0}
		<p class="empty">No trades yet.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Asset</th>
					<th>Buyer</th>
					<th>Size</th>
					<th>Price</th>
					<th>Seller</th>
					<th>Time</th>
				</tr>
			</thead>
			<tbody>
				{#each trades as trade (trade.id)}
					<tr>
						<td class="asset">{getAssetName(trade.asset_id)}</td>
						<td class="buyer">{getParticipantName(trade.buyer_id)}</td>
						<td class="size">{trade.size}</td>
						<td class="price">{trade.price}</td>
						<td class="seller">{getParticipantName(trade.seller_id)}</td>
						<td class="time">{formatTime(trade.executed_at)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.trade-blotter {
		flex: 1;
		overflow-y: auto;
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

	.asset {
		color: #fff;
		font-weight: 500;
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
		color: #7ec8ff;
	}

	.time {
		color: #435a80;
		font-size: 0.75rem;
	}

	@media (max-width: 600px) {
		th, td {
			padding: 0.25rem 0.375rem;
			font-size: 0.75rem;
		}
	}
</style>
