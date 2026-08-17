<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { logActivity } from '$lib/utils/activity-log';
	import { acceptProposal } from '$lib/utils/otc-actions';
	import {
		validateProposal,
		describeOutgoing,
		describeIncoming,
		incomingActionLabel,
		formatOtcTradeMessage,
		tradeParties,
		wasAmended,
		isPendingIncoming,
		isPendingOutgoing,
		involves,
		OtcError
	} from '$lib/utils/otc';
	import type { ActivityDetails, Asset, OrderSide, OtcProposal } from '$lib/types/database';

	export let proposals: OtcProposal[] = [];
	export let assets: Asset[] = [];
	export let participants: Array<{ id: string; name: string }> = [];
	export let participantId: string;
	export let marketId: string;

	const dispatch = createEventDispatcher();

	// Proposal form state
	let side: OrderSide = 'buy';
	let formAssetId = '';
	let formCounterpartyId = '';
	let price = '';
	let size = '';
	let sending = false;
	let formError = '';

	// Per-proposal action state
	let amendingId: string | null = null;
	let amendPrice = '';
	let amendSize = '';
	let busyId: string | null = null;
	let actionError = '';

	$: tradableAssets = assets.filter((a) => a.status === 'trading');
	$: counterparties = participants.filter((p) => p.id !== participantId);

	$: mine = proposals.filter((p) => involves(p, participantId));
	$: incoming = mine
		.filter((p) => isPendingIncoming(p, participantId))
		.sort((a, b) => b.created_at.localeCompare(a.created_at));
	$: outgoing = mine
		.filter((p) => isPendingOutgoing(p, participantId))
		.sort((a, b) => b.created_at.localeCompare(a.created_at));
	$: history = mine
		.filter((p) => p.status !== 'pending')
		.sort((a, b) => (b.resolved_at ?? b.updated_at).localeCompare(a.resolved_at ?? a.updated_at))
		.slice(0, 10);

	function assetName(id: string): string {
		return assets.find((a) => a.id === id)?.name ?? 'Unknown';
	}

	function participantName(id: string): string {
		return participants.find((p) => p.id === id)?.name ?? 'Unknown';
	}

	function formatTime(dateStr: string): string {
		return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	async function send() {
		const result = validateProposal({
			assetId: formAssetId,
			counterpartyId: formCounterpartyId,
			side,
			price,
			size
		});

		if (!result.ok) {
			formError = result.error;
			return;
		}

		sending = true;
		formError = '';

		try {
			const { data: proposal, error } = await supabase
				.from('otc_proposals')
				.insert({
					market_id: marketId,
					asset_id: formAssetId,
					proposer_id: participantId,
					counterparty_id: formCounterpartyId,
					side,
					price: result.value.price,
					size: result.value.size
				})
				.select()
				.single();

			if (error) throw error;

			dispatch('proposalUpserted', proposal);

			price = '';
			size = '';
		} catch (e) {
			formError = e instanceof Error ? e.message : 'Failed to send proposal';
		} finally {
			sending = false;
		}
	}

	function startAmend(proposal: OtcProposal) {
		amendingId = proposal.id;
		amendPrice = String(proposal.price);
		amendSize = String(proposal.size);
		actionError = '';
	}

	function cancelAmend() {
		amendingId = null;
		amendPrice = '';
		amendSize = '';
	}

	async function saveAmend(proposal: OtcProposal) {
		const result = validateProposal({
			assetId: proposal.asset_id,
			counterpartyId: proposal.counterparty_id,
			side: proposal.side,
			price: amendPrice,
			size: amendSize
		});

		if (!result.ok) {
			actionError = result.error;
			return;
		}

		busyId = proposal.id;
		actionError = '';

		try {
			const { data: updated, error } = await supabase
				.from('otc_proposals')
				.update({
					price: result.value.price,
					size: result.value.size,
					updated_at: new Date().toISOString()
				})
				.eq('id', proposal.id)
				.eq('status', 'pending')
				.select()
				.maybeSingle();

			if (error) throw error;
			if (!updated) throw new OtcError('This proposal is no longer pending');

			dispatch('proposalUpserted', updated);
			cancelAmend();
		} catch (e) {
			actionError = e instanceof Error ? e.message : 'Failed to amend proposal';
		} finally {
			busyId = null;
		}
	}

	async function resolve(proposal: OtcProposal, status: 'cancelled' | 'declined') {
		busyId = proposal.id;
		actionError = '';

		try {
			const { data: updated, error } = await supabase
				.from('otc_proposals')
				.update({ status, resolved_at: new Date().toISOString() })
				.eq('id', proposal.id)
				.eq('status', 'pending')
				.select()
				.maybeSingle();

			if (error) throw error;
			if (!updated) throw new OtcError('This proposal is no longer pending');

			dispatch('proposalUpserted', updated);
		} catch (e) {
			actionError = e instanceof Error ? e.message : `Failed to ${status === 'cancelled' ? 'cancel' : 'decline'} proposal`;
		} finally {
			busyId = null;
		}
	}

	async function accept(proposal: OtcProposal) {
		busyId = proposal.id;
		actionError = '';

		try {
			const trade = await acceptProposal(proposal, participantId);

			dispatch('proposalUpserted', {
				...proposal,
				status: 'accepted',
				trade_id: trade.id,
				resolved_at: new Date().toISOString()
			});
			dispatch('tradeExecuted', trade);
			dispatch('assetUpdated', { id: proposal.asset_id, last_price: proposal.price });

			const { buyerId, sellerId } = tradeParties(proposal);
			const buyerName = participantName(buyerId);
			const sellerName = participantName(sellerId);
			const name = assetName(proposal.asset_id);

			// Phrased buyer-first (an OTC print has no book aggressor to lead with)
			// and tagged so the feed can mark it as off-book.
			const details: ActivityDetails = {
				kind: 'trade',
				takerName: buyerName,
				makerName: sellerName,
				side: 'buy',
				assetName: name,
				price: proposal.price,
				size: proposal.size,
				otc: true
			};

			await logActivity(
				marketId,
				'trade',
				formatOtcTradeMessage(buyerName, sellerName, proposal.size, name, proposal.price),
				details
			);
		} catch (e) {
			actionError = e instanceof Error ? e.message : 'Failed to accept proposal';
		} finally {
			busyId = null;
		}
	}

	function statusLabel(proposal: OtcProposal): string {
		switch (proposal.status) {
			case 'accepted':
				return 'Traded';
			case 'declined':
				return 'Declined';
			case 'cancelled':
				return 'Cancelled';
			default:
				return 'Pending';
		}
	}
</script>

<div class="overlay" on:click|self={() => dispatch('close')} on:keydown={() => {}}>
	<div class="modal">
		<div class="modal-header">
			<h3>OTC Desk</h3>
			<button class="close-btn" on:click={() => dispatch('close')}>X</button>
		</div>

		<div class="modal-body">
			<div class="column">
				<h4>New Proposal</h4>

				{#if tradableAssets.length === 0}
					<p class="empty">No assets are trading yet.</p>
				{:else if counterparties.length === 0}
					<p class="empty">Nobody else has joined this market yet.</p>
				{:else}
					<div class="side-switch">
						<button
							class="side-btn buy"
							class:active={side === 'buy'}
							on:click={() => (side = 'buy')}
						>
							Bid / Buy
						</button>
						<button
							class="side-btn sell"
							class:active={side === 'sell'}
							on:click={() => (side = 'sell')}
						>
							Offer / Sell
						</button>
					</div>

					<label>
						<span>Asset</span>
						<select bind:value={formAssetId}>
							<option value="">Select asset...</option>
							{#each tradableAssets as asset (asset.id)}
								<option value={asset.id}>{asset.name}</option>
							{/each}
						</select>
					</label>

					<label>
						<span>{side === 'buy' ? 'Buy from' : 'Sell to'}</span>
						<select bind:value={formCounterpartyId}>
							<option value="">Select participant...</option>
							{#each counterparties as p (p.id)}
								<option value={p.id}>{p.name}</option>
							{/each}
						</select>
					</label>

					<div class="row">
						<label>
							<span>Price</span>
							<input type="number" step="0.1" bind:value={price} placeholder="0" />
						</label>
						<label>
							<span>Size</span>
							<input type="number" step="1" min="1" bind:value={size} placeholder="0" />
						</label>
					</div>

					{#if formAssetId && formCounterpartyId && price !== '' && size !== ''}
						<p class="preview">
							{describeOutgoing(side, Number(size), assetName(formAssetId), Number(price), participantName(formCounterpartyId))}
						</p>
					{/if}

					{#if formError}
						<p class="error">{formError}</p>
					{/if}

					<button class="send-btn" class:sell={side === 'sell'} on:click={send} disabled={sending}>
						{sending ? 'Sending...' : 'Send Proposal'}
					</button>
				{/if}

				<h4 class="spaced">Sent ({outgoing.length})</h4>
				{#if outgoing.length === 0}
					<p class="empty">No outstanding proposals.</p>
				{:else}
					<div class="list">
						{#each outgoing as p (p.id)}
							<div class="card">
								<div class="card-head">
									<span class="tag" class:sell={p.side === 'sell'}>{p.side === 'buy' ? 'BID' : 'OFFER'}</span>
									<span class="time">{formatTime(p.updated_at)}</span>
								</div>

								{#if amendingId === p.id}
									<p class="desc amend-context">
										{p.side === 'buy' ? 'You buy' : 'You sell'}
										{assetName(p.asset_id)}
										{p.side === 'buy' ? 'from' : 'to'}
										{participantName(p.counterparty_id)}
									</p>
									<div class="row amend-row">
										<label>
											<span>Price</span>
											<input type="number" step="0.1" bind:value={amendPrice} />
										</label>
										<label>
											<span>Size</span>
											<input type="number" step="1" min="1" bind:value={amendSize} />
										</label>
									</div>
									<div class="actions">
										<button class="accept-btn" on:click={() => saveAmend(p)} disabled={busyId === p.id}>
											Save
										</button>
										<button class="ghost-btn" on:click={cancelAmend}>Back</button>
									</div>
								{:else}
									<p class="desc">
										{describeOutgoing(p.side, p.size, assetName(p.asset_id), p.price, participantName(p.counterparty_id))}
									</p>
									<div class="actions">
										<span class="pending-dot">Awaiting response</span>
										<button class="ghost-btn" on:click={() => startAmend(p)} disabled={busyId === p.id}>
											Amend
										</button>
										<button class="decline-btn" on:click={() => resolve(p, 'cancelled')} disabled={busyId === p.id}>
											Cancel
										</button>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="column">
				<h4>
					Incoming
					{#if incoming.length > 0}<span class="count">{incoming.length}</span>{/if}
				</h4>

				{#if incoming.length === 0}
					<p class="empty">No incoming requests.</p>
				{:else}
					<div class="list">
						{#each incoming as p (p.id)}
							<div class="card incoming">
								<div class="card-head">
									<span class="tag" class:sell={p.side === 'buy'}>{incomingActionLabel(p.side)}</span>
									{#if wasAmended(p)}<span class="amended">amended</span>{/if}
									<span class="time">{formatTime(p.updated_at)}</span>
								</div>
								<p class="desc">
									{describeIncoming(p.side, p.size, assetName(p.asset_id), p.price, participantName(p.proposer_id))}
								</p>
								<div class="terms">
									<span><em>Asset</em> {assetName(p.asset_id)}</span>
									<span><em>Price</em> {p.price}</span>
									<span><em>Size</em> {p.size}</span>
								</div>
								<div class="actions">
									<button class="accept-btn" on:click={() => accept(p)} disabled={busyId === p.id}>
										{busyId === p.id ? 'Working...' : 'Accept'}
									</button>
									<button class="decline-btn" on:click={() => resolve(p, 'declined')} disabled={busyId === p.id}>
										Decline
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if actionError}
					<p class="error">{actionError}</p>
				{/if}

				<h4 class="spaced">History</h4>
				{#if history.length === 0}
					<p class="empty">Nothing settled yet.</p>
				{:else}
					<div class="history">
						{#each history as p (p.id)}
							<div class="history-row">
								<span class="history-status {p.status}">{statusLabel(p)}</span>
								<span class="history-text">
									{p.proposer_id === participantId
										? describeOutgoing(p.side, p.size, assetName(p.asset_id), p.price, participantName(p.counterparty_id))
										: describeIncoming(p.side, p.size, assetName(p.asset_id), p.price, participantName(p.proposer_id))}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
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
		width: 92%;
		max-width: 780px;
		max-height: 86vh;
		display: flex;
		flex-direction: column;
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
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
		padding: 1.25rem;
		overflow-y: auto;
	}

	.column {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;
	}

	h4 {
		margin: 0;
		color: #607a9c;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	h4.spaced {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid #1a2744;
	}

	.count {
		background: #ef4444;
		color: #fff;
		border-radius: 999px;
		padding: 0 0.4rem;
		font-size: 0.6875rem;
		font-weight: 700;
	}

	.side-switch {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}

	.side-btn {
		background: #0a1020;
		border: 1px solid #243254;
		color: #607a9c;
		padding: 0.5rem;
		border-radius: 6px;
		font-size: 0.8125rem;
		font-weight: 600;
	}

	.side-btn.buy.active {
		border-color: #4ade80;
		color: #4ade80;
		background: rgba(74, 222, 128, 0.12);
	}

	.side-btn.sell.active {
		border-color: #f87171;
		color: #f87171;
		background: rgba(248, 113, 113, 0.12);
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
	}

	label span {
		color: #607a9c;
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	select,
	input {
		background: #0a1020;
		border: 1px solid #243254;
		border-radius: 6px;
		color: #e2ecf8;
		padding: 0.5rem;
		font-size: 0.875rem;
		width: 100%;
	}

	select:focus,
	input:focus {
		outline: none;
		border-color: #3d5078;
	}

	.row {
		display: flex;
		gap: 0.5rem;
	}

	.preview {
		margin: 0;
		color: #adc5e4;
		font-size: 0.8125rem;
		background: #0a1020;
		border: 1px solid #1a2744;
		border-radius: 6px;
		padding: 0.5rem;
	}

	.send-btn {
		background: #4ade80;
		border: none;
		color: #06210f;
		padding: 0.6rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 700;
	}

	.send-btn.sell {
		background: #f87171;
		color: #2a0909;
	}

	.send-btn:disabled {
		opacity: 0.5;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.card {
		background: #0a1020;
		border: 1px solid #1a2744;
		border-radius: 8px;
		padding: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.card.incoming {
		border-color: #2e4a7d;
	}

	.card-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.tag {
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #4ade80;
		border: 1px solid rgba(74, 222, 128, 0.4);
		border-radius: 4px;
		padding: 0.1rem 0.35rem;
	}

	.tag.sell {
		color: #f87171;
		border-color: rgba(248, 113, 113, 0.4);
	}

	.amended {
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #fbbf24;
	}

	.time {
		margin-left: auto;
		color: #435a80;
		font-size: 0.6875rem;
	}

	.desc {
		margin: 0;
		color: #e2ecf8;
		font-size: 0.875rem;
	}

	.terms {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		font-size: 0.75rem;
		color: #adc5e4;
	}

	.terms em {
		font-style: normal;
		color: #435a80;
		text-transform: uppercase;
		font-size: 0.625rem;
		letter-spacing: 0.05em;
		margin-right: 0.25rem;
	}

	.actions {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	.pending-dot {
		flex: 1;
		color: #fbbf24;
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.accept-btn {
		background: #4ade80;
		border: none;
		color: #06210f;
		padding: 0.4rem 0.9rem;
		border-radius: 6px;
		font-size: 0.8125rem;
		font-weight: 700;
		flex: 1;
	}

	.decline-btn {
		background: transparent;
		border: 1px solid #f87171;
		color: #f87171;
		padding: 0.4rem 0.9rem;
		border-radius: 6px;
		font-size: 0.8125rem;
	}

	.decline-btn:hover {
		background: rgba(248, 113, 113, 0.12);
	}

	.ghost-btn {
		background: transparent;
		border: 1px solid #2e3e66;
		color: #8498b5;
		padding: 0.4rem 0.9rem;
		border-radius: 6px;
		font-size: 0.8125rem;
	}

	.ghost-btn:hover {
		border-color: #435a80;
		color: #adc5e4;
	}

	.accept-btn:disabled,
	.decline-btn:disabled,
	.ghost-btn:disabled {
		opacity: 0.5;
	}

	.amend-context {
		color: #8498b5;
		font-size: 0.8125rem;
	}

	.amend-row {
		align-items: flex-end;
	}

	.history {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.history-row {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 0.75rem;
		border-bottom: 1px solid #1a2744;
		padding-bottom: 0.25rem;
	}

	.history-status {
		flex-shrink: 0;
		text-transform: uppercase;
		font-size: 0.625rem;
		letter-spacing: 0.05em;
		font-weight: 600;
		color: #607a9c;
	}

	.history-status.accepted {
		color: #4ade80;
	}

	.history-status.declined,
	.history-status.cancelled {
		color: #f87171;
	}

	.history-text {
		color: #8498b5;
	}

	.empty {
		color: #435a80;
		font-size: 0.8125rem;
		margin: 0;
		padding: 0.5rem 0;
	}

	.error {
		color: #f87171;
		font-size: 0.8125rem;
		margin: 0;
	}

	@media (max-width: 700px) {
		.modal-body {
			grid-template-columns: 1fr;
		}
	}
</style>
