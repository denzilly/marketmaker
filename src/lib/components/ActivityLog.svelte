<script lang="ts">
	import type { ActivityLogEntry } from '$lib/types/database';

	export let entries: ActivityLogEntry[] = [];

	function formatTime(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function icon(type: ActivityLogEntry['type']): string {
		switch (type) {
			case 'trade':
				return '⚡';
			case 'order_new':
				return '+';
			case 'order_cancelled':
				return '✕';
			case 'order_amended':
				return '✎';
			case 'settlement':
				return '🏁';
			default:
				return '•';
		}
	}
</script>

<div class="activity-log">
	<div class="section-header">
		<h2>Activity</h2>
	</div>
	<div class="entries">
		{#if entries.length === 0}
			<p class="empty">No activity yet.</p>
		{:else}
			{#each entries as entry (entry.id)}
				<div class="entry entry-{entry.type}">
					<span class="entry-icon">{icon(entry.type)}</span>
					<span class="entry-text">
						{#if entry.details?.kind === 'order_new'}
							{@const d = entry.details}
							<span class="name">{d.actorName}</span> is now
							{#if d.better}<span class="better">better</span>{/if}
							{d.side === 'buy' ? 'bid' : 'offered'}
							<span class="num" class:hl={d.highlightPrice}>{d.price}</span>
							for
							<span class="num" class:hl={d.highlightSize}>{d.size}</span>
							in
							<span class="asset">{d.assetName}</span>
						{:else if entry.details?.kind === 'trade'}
							{@const d = entry.details}
							<span class="name">{d.takerName}</span>
							{d.side === 'buy' ? 'bought' : 'sold'}
							<span class="num">{d.size}</span>
							<span class="asset">{d.assetName}</span>
							{d.side === 'buy' ? 'from' : 'to'}
							<span class="name">{d.makerName}</span>
							@ <span class="num">{d.price}</span>
						{:else if entry.details?.kind === 'order_cancelled'}
							{@const d = entry.details}
							<span class="name">{d.actorName}</span> pulled their {d.side === 'buy' ? 'bid' : 'offer'} for
							<span class="num">{d.size}</span>
							<span class="asset">{d.assetName}</span>
							at <span class="num">{d.price}</span>
						{:else if entry.details?.kind === 'order_amended'}
							{@const d = entry.details}
							<span class="name">{d.actorName}</span> {d.verb} their {d.side === 'buy' ? 'bid' : 'offer'} for
							<span class="asset">{d.assetName}</span>
							from <span class="num">{d.oldSize}</span> @ <span class="num">{d.oldPrice}</span>
							to <span class="num">{d.newSize}</span> @ <span class="num">{d.newPrice}</span>
						{:else if entry.details?.kind === 'settlement'}
							{@const d = entry.details}
							<span class="asset">{d.assetName}</span> settled at <span class="num">{d.value}</span>
						{:else}
							{entry.message}
						{/if}
					</span>
					<span class="entry-time">{formatTime(entry.created_at)}</span>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.activity-log {
		width: 100%;
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.section-header {
		margin-bottom: 0.5rem;
	}

	.section-header h2 {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #607a9c;
		margin: 0;
	}

	.entries {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-height: 0;
	}

	.empty {
		color: #435a80;
		text-align: center;
		padding: 1rem;
	}

	.entry {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.25rem 0;
		font-size: 0.8125rem;
		border-bottom: 1px solid #1a2744;
	}

	.entry:last-child {
		border-bottom: none;
	}

	.entry-icon {
		flex-shrink: 0;
		width: 1.1em;
		text-align: center;
		color: #435a80;
	}

	.entry-text {
		color: #adc5e4;
		word-break: break-word;
		flex: 1;
	}

	.entry-time {
		color: #435a80;
		font-size: 0.6875rem;
		flex-shrink: 0;
	}

	/* Shared pieces used across the structured sentence templates */
	.name {
		color: #c5d0e3;
		font-weight: 500;
	}

	.asset {
		color: #fff;
		font-weight: 500;
	}

	.num {
		color: #adc5e4;
	}

	.num.hl {
		color: #fbbf24;
		font-weight: 600;
	}

	.better {
		color: #4ade80;
		font-weight: 600;
		text-transform: uppercase;
		font-size: 0.6875rem;
		letter-spacing: 0.03em;
	}

	.entry-trade .entry-icon {
		color: #fbbf24;
	}

	.entry-order_new .entry-icon {
		color: #4ade80;
	}

	.entry-order_cancelled .entry-icon {
		color: #f87171;
	}

	.entry-order_cancelled .entry-text {
		color: #8498b5;
	}

	.entry-order_amended .entry-icon {
		color: #7ec8ff;
	}

	.entry-settlement .entry-icon {
		color: #fbbf24;
	}

	.entry-settlement .entry-text {
		color: #fbbf24;
		font-weight: 500;
	}

	@media (max-width: 600px) {
		.entry {
			font-size: 0.75rem;
		}
	}
</style>
