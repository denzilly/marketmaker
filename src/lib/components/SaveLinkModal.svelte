<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let link: string;

	const dispatch = createEventDispatcher();

	let copied = false;

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	function close() {
		dispatch('close');
	}
</script>

<div class="modal-backdrop" on:click={close} on:keydown={(e) => e.key === 'Escape' && close()}>
	<div class="modal" on:click|stopPropagation role="dialog" aria-modal="true">
		<h2>Save your personal link!</h2>
		<p>This is your key to get back into the market. Bookmark it or save it somewhere safe.</p>

		<div class="link-box">
			<input type="text" readonly value={link} />
			<button class="copy-btn" on:click={copyLink}>
				{copied ? 'Copied!' : 'Copy'}
			</button>
		</div>

		<button class="continue-btn" on:click={close}>Continue</button>
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
		padding: 2rem;
		max-width: 500px;
		width: 90%;
	}

	h2 {
		margin: 0 0 0.5rem 0;
		color: #fff;
		font-size: 1.25rem;
	}

	p {
		color: #607a9c;
		margin: 0 0 1.5rem 0;
		font-size: 0.9375rem;
		line-height: 1.5;
	}

	.link-box {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	input {
		flex: 1;
		padding: 0.75rem;
		background: #0a1020;
		border: 1px solid #243254;
		border-radius: 8px;
		color: #7ec8ff;
		font-family: monospace;
		font-size: 0.875rem;
	}

	.copy-btn {
		padding: 0.75rem 1rem;
		background: #243254;
		border: none;
		border-radius: 8px;
		color: #fff;
		font-size: 0.875rem;
		white-space: nowrap;
	}

	.copy-btn:hover {
		background: #2e3e66;
	}

	.continue-btn {
		width: 100%;
		padding: 0.875rem;
		background: #2563eb;
		border: none;
		border-radius: 8px;
		color: #fff;
		font-size: 1rem;
		font-weight: 500;
	}

	.continue-btn:hover {
		background: #1d4ed8;
	}
</style>
