<script lang="ts">
	import { goto } from '$app/navigation';
	import { generateMarketCode } from '$lib/utils/market-code';
	import { supabase } from '$lib/supabase';

	let joinCode = '';
	let playerName = '';
	let mode: 'select' | 'create' | 'join' = 'select';
	let loading = false;
	let error = '';

	async function createMarket() {
		if (!playerName.trim()) return;

		loading = true;
		error = '';

		try {
			const code = generateMarketCode();

			// Create market
			const { data: market, error: marketError } = await supabase
				.from('markets')
				.insert({ code, name: code })
				.select()
				.single();

			if (marketError) throw marketError;

			// Create participant (admin)
			const { data: participant, error: participantError } = await supabase
				.from('participants')
				.insert({
					market_id: market.id,
					name: playerName.trim(),
					is_admin: true
				})
				.select()
				.single();

			if (participantError) throw participantError;

			// Update market with creator
			await supabase
				.from('markets')
				.update({ created_by: participant.id })
				.eq('id', market.id);

			// Navigate to market with participant token
			goto(`/m/${code}?p=${participant.token}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create market';
		} finally {
			loading = false;
		}
	}

	async function joinMarket() {
		if (!joinCode.trim() || !playerName.trim()) return;

		loading = true;
		error = '';

		try {
			const code = joinCode.toLowerCase().trim();

			// Find market by code
			const { data: market, error: marketError } = await supabase
				.from('markets')
				.select()
				.eq('code', code)
				.single();

			if (marketError) {
				if (marketError.code === 'PGRST116') {
					throw new Error('Market not found. Check the code and try again.');
				}
				throw marketError;
			}

			// Create participant
			const { data: participant, error: participantError } = await supabase
				.from('participants')
				.insert({
					market_id: market.id,
					name: playerName.trim(),
					is_admin: false
				})
				.select()
				.single();

			if (participantError) throw participantError;

			// Navigate to market with participant token
			goto(`/m/${code}?p=${participant.token}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to join market';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>MarketMaker</title>
</svelte:head>

<main>
	<div class="container">
		<h1>MarketMaker</h1>
		<p class="tagline">Create markets. Trade with friends. Settle your bets.</p>

		{#if mode === 'select'}
			<div class="button-group">
				<button class="primary" on:click={() => { mode = 'create'; error = ''; }}>
					Create a Market
				</button>
				<button class="secondary" on:click={() => { mode = 'join'; error = ''; }}>
					Join a Market
				</button>
			</div>
		{:else if mode === 'create'}
			<div class="form">
				<h2>Create a Market</h2>
				{#if error}
					<div class="error">{error}</div>
				{/if}
				<label>
					Your Name
					<input
						type="text"
						bind:value={playerName}
						placeholder="Enter your name"
						maxlength="20"
						disabled={loading}
					/>
				</label>
				<div class="button-group">
					<button class="primary" on:click={createMarket} disabled={!playerName.trim() || loading}>
						{loading ? 'Creating...' : 'Create'}
					</button>
					<button class="secondary" on:click={() => { mode = 'select'; error = ''; }} disabled={loading}>
						Back
					</button>
				</div>
			</div>
		{:else if mode === 'join'}
			<div class="form">
				<h2>Join a Market</h2>
				{#if error}
					<div class="error">{error}</div>
				{/if}
				<label>
					Market Code
					<input
						type="text"
						bind:value={joinCode}
						placeholder="e.g. apple-tiger-moon"
						disabled={loading}
					/>
				</label>
				<label>
					Your Name
					<input
						type="text"
						bind:value={playerName}
						placeholder="Enter your name"
						maxlength="20"
						disabled={loading}
					/>
				</label>
				<div class="button-group">
					<button
						class="primary"
						on:click={joinMarket}
						disabled={!joinCode.trim() || !playerName.trim() || loading}
					>
						{loading ? 'Joining...' : 'Join'}
					</button>
					<button class="secondary" on:click={() => { mode = 'select'; error = ''; }} disabled={loading}>
						Back
					</button>
				</div>
			</div>
		{/if}
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.container {
		max-width: 400px;
		width: 100%;
		text-align: center;
	}

	h1 {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
		color: #fff;
	}

	.tagline {
		color: #888;
		margin-bottom: 2rem;
	}

	h2 {
		font-size: 1.25rem;
		margin-bottom: 1.5rem;
		color: #fff;
	}

	.form {
		background: #1a1a1a;
		padding: 2rem;
		border-radius: 12px;
		border: 1px solid #333;
	}

	label {
		display: block;
		text-align: left;
		margin-bottom: 1rem;
		font-size: 0.875rem;
		color: #aaa;
	}

	input {
		display: block;
		width: 100%;
		padding: 0.75rem;
		margin-top: 0.5rem;
		border: 1px solid #333;
		border-radius: 8px;
		background: #0f0f0f;
		color: #fff;
		font-size: 1rem;
	}

	input:focus {
		outline: none;
		border-color: #6eb5ff;
	}

	input:disabled {
		opacity: 0.5;
	}

	.error {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
		color: #ef4444;
		padding: 0.75rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-size: 0.875rem;
	}

	.button-group {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	button {
		padding: 0.875rem 1.5rem;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 500;
		border: none;
		transition: all 0.15s ease;
	}

	button.primary {
		background: #2563eb;
		color: #fff;
	}

	button.primary:hover:not(:disabled) {
		background: #1d4ed8;
	}

	button.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	button.secondary {
		background: transparent;
		color: #888;
		border: 1px solid #333;
	}

	button.secondary:hover {
		border-color: #555;
		color: #aaa;
	}
</style>
