<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { Asset, Trade, Participant } from '$lib/types/database';

	export let trades: Trade[] = [];
	export let assets: Asset[] = [];
	export let participants: Pick<Participant, 'id' | 'name'>[] = [];

	const dispatch = createEventDispatcher();

	interface Transfer {
		from: string;
		fromName: string;
		to: string;
		toName: string;
		amount: number;
	}

	function getName(id: string): string {
		return participants.find((p) => p.id === id)?.name ?? 'Unknown';
	}

	// Compute realized P&L per participant across all settled assets
	$: settledAssets = assets.filter((a) => a.status === 'settled');

	$: balances = (() => {
		const map = new Map<string, number>();

		for (const asset of settledAssets) {
			if (asset.settlement_value === null) continue;

			const assetTrades = trades.filter((t) => t.asset_id === asset.id);

			// Build per-participant position for this asset
			const positions = new Map<string, { net: number; cash_flow: number }>();

			for (const t of assetTrades) {
				// Buyer
				if (!positions.has(t.buyer_id)) positions.set(t.buyer_id, { net: 0, cash_flow: 0 });
				const buyer = positions.get(t.buyer_id)!;
				buyer.net += t.size;
				buyer.cash_flow -= t.price * t.size;

				// Seller
				if (!positions.has(t.seller_id)) positions.set(t.seller_id, { net: 0, cash_flow: 0 });
				const seller = positions.get(t.seller_id)!;
				seller.net -= t.size;
				seller.cash_flow += t.price * t.size;
			}

			// Compute realized P&L and add to balances
			for (const [pid, pos] of positions) {
				const pnl = pos.cash_flow + pos.net * asset.settlement_value;
				map.set(pid, (map.get(pid) ?? 0) + pnl);
			}
		}

		return map;
	})();

	// Compute minimum transfers using greedy algorithm
	$: transfers = (() => {
		const result: Transfer[] = [];

		// Create mutable copy of balances
		const debtors: { id: string; amount: number }[] = [];
		const creditors: { id: string; amount: number }[] = [];

		for (const [id, balance] of balances) {
			// Round to 2 decimals to avoid floating point noise
			const rounded = Math.round(balance * 100) / 100;
			if (rounded < 0) debtors.push({ id, amount: -rounded });
			else if (rounded > 0) creditors.push({ id, amount: rounded });
		}

		// Sort descending by amount
		debtors.sort((a, b) => b.amount - a.amount);
		creditors.sort((a, b) => b.amount - a.amount);

		let di = 0;
		let ci = 0;

		while (di < debtors.length && ci < creditors.length) {
			const transfer = Math.min(debtors[di].amount, creditors[ci].amount);
			if (transfer > 0.005) {
				result.push({
					from: debtors[di].id,
					fromName: getName(debtors[di].id),
					to: creditors[ci].id,
					toName: getName(creditors[ci].id),
					amount: Math.round(transfer * 100) / 100
				});
			}

			debtors[di].amount -= transfer;
			creditors[ci].amount -= transfer;

			if (debtors[di].amount < 0.005) di++;
			if (creditors[ci].amount < 0.005) ci++;
		}

		return result;
	})();

	$: hasSettledAssets = settledAssets.length > 0;
</script>

<div class="overlay" on:click|self={() => dispatch('close')} on:keydown={() => {}}>
	<div class="modal">
		<div class="modal-header">
			<h3>Settle Up</h3>
			<button class="close-btn" on:click={() => dispatch('close')}>X</button>
		</div>

		<div class="modal-body">
			{#if !hasSettledAssets}
				<p class="empty">No assets have been settled yet.</p>
			{:else if transfers.length === 0}
				<p class="empty">All square! No payments needed.</p>
			{:else}
				<p class="subtitle">Based on {settledAssets.length} settled asset{settledAssets.length !== 1 ? 's' : ''}:</p>

				<div class="transfers">
					{#each transfers as t}
						<div class="transfer-row">
							<span class="from">{t.fromName}</span>
							<span class="arrow">pays</span>
							<span class="to">{t.toName}</span>
							<span class="amount">{t.amount.toFixed(2)}</span>
						</div>
					{/each}
				</div>

				<div class="balances">
					<h4>Net P&L by participant</h4>
					{#each [...balances.entries()].sort((a, b) => b[1] - a[1]) as [pid, balance]}
						{@const rounded = Math.round(balance * 100) / 100}
						{#if rounded !== 0}
							<div class="balance-row">
								<span class="name">{getName(pid)}</span>
								<span class="balance" class:positive={rounded > 0} class:negative={rounded < 0}>
									{rounded > 0 ? '+' : ''}{rounded.toFixed(2)}
								</span>
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(6, 10, 24, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		background: #111b2e;
		border: 1px solid #243254;
		border-radius: 12px;
		width: 90%;
		max-width: 480px;
		max-height: 80vh;
		overflow-y: auto;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #243254;
	}

	.modal-header h3 {
		margin: 0;
		color: #fff;
		font-size: 1.125rem;
	}

	.close-btn {
		background: transparent;
		border: 1px solid #2e3e66;
		border-radius: 4px;
		color: #607a9c;
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
	}

	.close-btn:hover {
		border-color: #435a80;
		color: #8498b5;
	}

	.modal-body {
		padding: 1.25rem;
	}

	.empty {
		color: #435a80;
		text-align: center;
		padding: 1rem 0;
	}

	.subtitle {
		color: #607a9c;
		font-size: 0.8125rem;
		margin: 0 0 1rem 0;
	}

	.transfers {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.transfer-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: #0a1020;
		border-radius: 8px;
		border: 1px solid #1a2744;
	}

	.from {
		color: #f87171;
		font-weight: 500;
		flex: 1;
	}

	.arrow {
		color: #3d5078;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.to {
		color: #4ade80;
		font-weight: 500;
		flex: 1;
		text-align: right;
	}

	.amount {
		color: #fff;
		font-weight: 600;
		font-size: 1rem;
		min-width: 60px;
		text-align: right;
	}

	.balances {
		border-top: 1px solid #243254;
		padding-top: 1rem;
	}

	.balances h4 {
		margin: 0 0 0.75rem 0;
		color: #607a9c;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.balance-row {
		display: flex;
		justify-content: space-between;
		padding: 0.375rem 0;
	}

	.name {
		color: #8498b5;
		font-size: 0.875rem;
	}

	.balance {
		font-weight: 500;
		font-size: 0.875rem;
	}

	.balance.positive {
		color: #4ade80;
	}

	.balance.negative {
		color: #f87171;
	}
</style>
