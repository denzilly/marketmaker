<script lang="ts">
	import type { Asset, Trade } from '$lib/types/database';

	export let trades: Trade[] = [];
	export let assets: Asset[] = [];
	export let participantId: string;

	interface ComputedPosition {
		asset: Asset;
		net_position: number;
		cash_flow: number;
		pnl: number | null;
		is_settled: boolean;
	}

	// Compute positions reactively from trades
	$: positions = assets
		.map((asset) => {
			const assetTrades = trades.filter((t) => t.asset_id === asset.id);

			let net_position = 0;
			let cash_flow = 0;

			for (const t of assetTrades) {
				if (t.buyer_id === participantId) {
					net_position += t.size;
					cash_flow -= t.price * t.size;
				}
				if (t.seller_id === participantId) {
					net_position -= t.size;
					cash_flow += t.price * t.size;
				}
			}

			const is_settled = asset.status === 'settled';
			const mark_price = is_settled ? asset.settlement_value : asset.last_price;

			const pnl =
				mark_price !== null && net_position !== 0
					? cash_flow + net_position * mark_price
					: null;

			return { asset, net_position, cash_flow, pnl, is_settled } as ComputedPosition;
		})
		.filter((p) => p.net_position !== 0);
</script>

<div class="position-blotter">
	{#if positions.length === 0}
		<p class="empty">No positions yet.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Asset</th>
					<th>Position</th>
					<th>P&L</th>
				</tr>
			</thead>
			<tbody>
				{#each positions as pos}
					<tr class:settled-row={pos.is_settled}>
						<td class="asset">
							{pos.asset.name}
							{#if pos.is_settled}
								<span class="settled-badge">SETTLED</span>
							{/if}
						</td>
						<td class="position" class:long={pos.net_position > 0} class:short={pos.net_position < 0}>
							{pos.net_position > 0 ? '+' : ''}{pos.net_position}
						</td>
						<td
							class="pnl"
							class:positive={pos.pnl !== null && pos.pnl > 0}
							class:negative={pos.pnl !== null && pos.pnl < 0}
						>
							{#if pos.pnl !== null}
								{pos.pnl > 0 ? '+' : ''}{pos.pnl.toFixed(2)}
								<span class="pnl-label">{pos.is_settled ? 'realized' : 'unrealized'}</span>
							{:else}
								-
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.position-blotter {
		width: 100%;
	}

	.empty {
		color: #666;
		text-align: center;
		padding: 1rem;
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
		padding: 0.5rem;
		font-size: 0.875rem;
		border-bottom: 1px solid #222;
	}

	.asset {
		color: #fff;
	}

	.position {
		font-weight: 500;
	}

	.position.long {
		color: #4ade80;
	}

	.position.short {
		color: #f87171;
	}

	.pnl {
		font-weight: 500;
	}

	.pnl.positive {
		color: #4ade80;
	}

	.pnl.negative {
		color: #f87171;
	}

	.settled-badge {
		display: inline-block;
		font-size: 0.625rem;
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.15);
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		margin-left: 0.375rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		vertical-align: middle;
	}

	.pnl-label {
		display: block;
		font-size: 0.625rem;
		font-weight: 400;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	tr.settled-row td.asset {
		color: #aaa;
	}
</style>
