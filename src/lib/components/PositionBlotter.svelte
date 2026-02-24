<script lang="ts">
	export let positions: Array<{
		participant_id: string;
		asset_id: string;
		asset_name: string;
		last_price: number | null;
		asset_status: string;
		settlement_value: number | null;
		net_position: number;
		cash_flow: number;
	}> = [];
	export let participantId: string;
	export let participants: Array<{ id: string; name: string }> = [];

	let selectedParticipantId: string = participantId;

	interface DisplayPosition {
		asset_name: string;
		net_position: number;
		cash_flow: number;
		pnl: number | null;
		is_settled: boolean;
	}

	// Filter positions by selected participant and compute P&L
	$: displayPositions = positions
		.filter((p) => p.participant_id === selectedParticipantId)
		.map((p) => {
			const is_settled = p.asset_status === 'settled';
			const mark_price = is_settled ? p.settlement_value : p.last_price;

			const pnl =
				p.net_position === 0
					? (p.cash_flow !== 0 ? p.cash_flow : null)
					: (mark_price !== null ? p.cash_flow + p.net_position * mark_price : null);

			return {
				asset_name: p.asset_name,
				net_position: p.net_position,
				cash_flow: p.cash_flow,
				pnl,
				is_settled
			} as DisplayPosition;
		});

	$: totalPnl = displayPositions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
</script>

<div class="position-blotter">
	<div class="section-header">
		<h2>Positions</h2>
		{#if participants.length > 1}
			<select bind:value={selectedParticipantId}>
				{#each participants as p}
					<option value={p.id}>{p.id === participantId ? `${p.name} (You)` : p.name}</option>
				{/each}
			</select>
		{/if}
	</div>
	{#if displayPositions.length === 0}
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
				{#each displayPositions as pos}
					<tr class:settled-row={pos.is_settled}>
						<td class="asset">
							{pos.asset_name}
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
								<span class="pnl-label">{pos.is_settled || pos.net_position === 0 ? 'realized' : 'unrealized'}</span>
							{:else}
								-
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
					<tr class="total-row">
						<td class="asset">Total</td>
						<td></td>
						<td
							class="pnl"
							class:positive={totalPnl > 0}
							class:negative={totalPnl < 0}
						>
							{totalPnl > 0 ? '+' : ''}{totalPnl.toFixed(2)}
						</td>
					</tr>
				</tfoot>
		</table>
	{/if}
</div>

<style>
	.position-blotter {
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
		padding: 0.5rem;
		font-size: 0.875rem;
		border-bottom: 1px solid #1a2744;
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
		color: #435a80;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	tr.settled-row td.asset {
		color: #8498b5;
	}

	tfoot td {
		border-top: 1px solid #243254;
		border-bottom: none;
		font-weight: 600;
		color: #8498b5;
	}
</style>
