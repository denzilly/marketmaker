<script lang="ts">
	import type { PositionWithAsset } from '$lib/types/database';

	// TODO: Replace with real data from Supabase store
	let positions: PositionWithAsset[] = [];
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
					<tr>
						<td class="asset">{pos.asset.name}</td>
						<td class="position" class:long={pos.net_position > 0} class:short={pos.net_position < 0}>
							{pos.net_position > 0 ? '+' : ''}{pos.net_position}
						</td>
						<td
							class="pnl"
							class:positive={pos.unrealized_pnl !== null && pos.unrealized_pnl > 0}
							class:negative={pos.unrealized_pnl !== null && pos.unrealized_pnl < 0}
						>
							{#if pos.unrealized_pnl !== null}
								{pos.unrealized_pnl > 0 ? '+' : ''}{pos.unrealized_pnl.toFixed(2)}
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
</style>
