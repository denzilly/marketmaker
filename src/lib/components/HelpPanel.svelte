<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-backdrop" on:click|self={() => dispatch('close')}>
	<div class="modal">
		<div class="modal-header">
			<h2>How to Play</h2>
			<button class="close-btn" on:click={() => dispatch('close')}>✕</button>
		</div>

		<div class="content">
			<section>
				<h3>What is MarketMaker?</h3>
				<p>
					MarketMaker is a prediction market game. Players create
					<strong>assets</strong> that represent real-world outcomes
					(e.g. "Alice's exam score", "Goals in tonight's match") and
					trade on them by posting bids and offers. When the outcome is
					known, the admin settles the asset and everyone's P&L is
					finalized.
				</p>
			</section>

			<section>
				<h3>The Order Book</h3>
				<p>
					Each asset has its own order book showing the current best
					<strong class="bid">bid</strong> (highest buy price) and best
					<strong class="ask">offer</strong> (lowest sell price). The
					depth view shows all resting orders at each price level.
				</p>
			</section>

			<section>
				<h3>Placing Orders</h3>
				<ol>
					<li>Click the <strong>+</strong> button next to an asset to open the order entry form.</li>
					<li>Enter a <strong>bid</strong> (buy) price and/or an <strong>offer</strong> (sell) price, along with the size for each.</li>
					<li>Click <strong>Submit</strong> or press <strong>Enter</strong> to send your order.</li>
					<li>If your bid matches or exceeds an existing offer (or vice versa), a trade executes immediately at the resting order's price.</li>
					<li>If there's no match, your order rests in the book until someone trades against it or you cancel it.</li>
				</ol>
			</section>

			<section>
				<h3>Trading</h3>
				<p>
					You can also trade instantly by clicking a price button in
					the order book. Clicking a <strong class="ask">green
					offer</strong> buys at that price. Clicking a
					<strong class="bid">red bid</strong> sells at that price.
					You cannot trade against your own orders.
				</p>
			</section>

			<section>
				<h3>Positions & P&L</h3>
				<p>
					The <strong>My Positions</strong> panel shows your net
					position in each asset and your mark-to-market P&L.
					Unrealized P&L is based on the last traded price. Once an
					asset is settled, your P&L becomes realized and final.
				</p>
			</section>

			<section>
				<h3>Settlement</h3>
				<p>
					When the real-world outcome is known, the admin enters the
					<strong>settlement value</strong> for the asset. This locks
					the asset from further trading, cancels all open orders, and
					converts everyone's unrealized P&L into realized P&L.
				</p>
			</section>

			<section>
				<h3>Settle Up</h3>
				<p>
					Click <strong>Settle Up</strong> to see the net amounts owed
					between all players across all settled assets. This tells you
					who owes whom and how much.
				</p>
			</section>

			<section>
				<h3>Tips</h3>
				<ul>
					<li>Save your personal link &mdash; it's the only way to access your account.</li>
					<li>You can submit both a bid and an offer at the same time (a two-way quote).</li>
					<li>Prices accept one decimal place (e.g. 4.5 is valid, 4.55 is not).</li>
					<li>All updates are real-time &mdash; you'll hear a sound when orders or trades happen.</li>
				</ul>
			</section>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
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
		padding: 1.5rem;
		max-width: 560px;
		width: 90%;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		flex-shrink: 0;
	}

	h2 {
		margin: 0;
		color: #fff;
		font-size: 1.25rem;
	}

	.close-btn {
		background: transparent;
		border: 1px solid #243254;
		color: #607a9c;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.875rem;
	}

	.close-btn:hover {
		border-color: #3d5078;
		color: #8498b5;
	}

	.content {
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	section {
		margin-bottom: 1.25rem;
	}

	section:last-child {
		margin-bottom: 0;
	}

	h3 {
		font-size: 0.8125rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #7ec8ff;
		margin: 0 0 0.5rem 0;
	}

	p {
		color: #8498b5;
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.6;
	}

	ol, ul {
		color: #8498b5;
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.8125rem;
		line-height: 1.6;
	}

	li {
		margin-bottom: 0.25rem;
	}

	li:last-child {
		margin-bottom: 0;
	}

	strong {
		color: #c5d0e3;
	}

	.bid {
		color: #f87171;
	}

	.ask {
		color: #4ade80;
	}
</style>
