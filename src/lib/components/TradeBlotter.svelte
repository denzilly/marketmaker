<script lang="ts">
	import type { Asset, OrderSide } from '$lib/types/database';

	interface TradeData {
		id: string;
		asset_id: string;
		buyer_id: string;
		seller_id: string;
		price: number;
		size: number;
		executed_at: string;
		taker_side: OrderSide | null;
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

	// The "taker" is whoever crossed the book (the aggressor); the "maker" is
	// whoever was resting in the book and got hit. Trades recorded before this
	// was tracked (taker_side null) default to reading buyer-first.
	function takerSide(trade: TradeData): OrderSide {
		return trade.taker_side ?? 'buy';
	}

	function takerId(trade: TradeData): string {
		return takerSide(trade) === 'sell' ? trade.seller_id : trade.buyer_id;
	}

	function makerId(trade: TradeData): string {
		return takerSide(trade) === 'sell' ? trade.buyer_id : trade.seller_id;
	}

	function preposition(trade: TradeData): string {
		return takerSide(trade) === 'sell' ? 'to' : 'from';
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
					<th>Taker</th>
					<th>Side</th>
					<th>Asset</th>
					<th class="prep-col"></th>
					<th>Maker</th>
					<th>Price</th>
					<th>Size</th>
					<th>Time</th>
				</tr>
			</thead>
			<tbody>
				{#each trades as trade (trade.id)}
					<tr>
						<td class="trader">{getParticipantName(takerId(trade))}</td>
						<td class="side" class:buy={takerSide(trade) === 'buy'} class:sell={takerSide(trade) === 'sell'}>
							{takerSide(trade) === 'buy' ? 'BUYS' : 'SELLS'}
						</td>
						<td class="asset">{getAssetName(trade.asset_id)}</td>
						<td class="prep-col">{preposition(trade)}</td>
						<td class="counterparty">{getParticipantName(makerId(trade))}</td>
						<td class="price">{trade.price}</td>
						<td class="size">{trade.size}</td>
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

	.trader {
		color: #fff;
		font-weight: 500;
	}

	.asset {
		color: #adc5e4;
	}

	.side {
		font-weight: 600;
		font-size: 0.75rem;
		letter-spacing: 0.03em;
	}

	.side.buy {
		color: #4ade80;
	}

	.side.sell {
		color: #f87171;
	}

	.counterparty {
		color: #8498b5;
	}

	.prep-col {
		width: 1%;
		white-space: nowrap;
		padding-left: 0;
		padding-right: 0;
		color: #435a80;
		font-size: 0.75rem;
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
		white-space: nowrap;
	}

	@media (max-width: 600px) {
		th, td {
			padding: 0.25rem 0.375rem;
			font-size: 0.75rem;
		}
	}
</style>
