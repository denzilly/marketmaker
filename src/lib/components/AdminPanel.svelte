<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';

	export let marketId: string;
	export let marketCode: string;

	const dispatch = createEventDispatcher();

	interface ParticipantInfo {
		id: string;
		name: string;
		token: string;
		is_admin: boolean;
		joined_at: string;
	}

	let participants: ParticipantInfo[] = [];
	let loading = true;
	let copiedToken: string | null = null;

	onMount(async () => {
		const { data } = await supabase
			.from('participants')
			.select('id, name, token, is_admin, joined_at')
			.eq('market_id', marketId)
			.order('joined_at', { ascending: true });

		participants = (data ?? []) as ParticipantInfo[];
		loading = false;
	});

	function getLink(token: string): string {
		const baseUrl = $page.url.origin;
		return `${baseUrl}/m/${marketCode}?p=${token}`;
	}

	async function copyLink(token: string) {
		try {
			await navigator.clipboard.writeText(getLink(token));
			copiedToken = token;
			setTimeout(() => {
				copiedToken = null;
			}, 2000);
		} catch {
			// Fallback: select text in a temporary input
		}
	}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-backdrop" on:click|self={() => dispatch('close')}>
	<div class="modal">
		<div class="modal-header">
			<h2>Admin Panel</h2>
			<button class="close-btn" on:click={() => dispatch('close')}>✕</button>
		</div>

		<section class="panel-section">
			<h3>Participants</h3>
			{#if loading}
				<p class="loading">Loading...</p>
			{:else if participants.length === 0}
				<p class="empty">No participants yet.</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th>Name</th>
							<th>Role</th>
							<th class="link-col">Link</th>
						</tr>
					</thead>
					<tbody>
						{#each participants as p}
							<tr>
								<td class="name">{p.name}</td>
								<td>
									{#if p.is_admin}
										<span class="admin-tag">Admin</span>
									{:else}
										<span class="role">Player</span>
									{/if}
								</td>
								<td class="link-col">
									<button
										class="copy-link-btn"
										on:click={() => copyLink(p.token)}
									>
										{copiedToken === p.token ? 'Copied!' : 'Copy Link'}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
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
		max-width: 500px;
		width: 90%;
		max-height: 80vh;
		overflow-y: auto;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
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

	.panel-section {
		margin-bottom: 1rem;
	}

	h3 {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #607a9c;
		margin: 0 0 0.75rem 0;
	}

	.loading,
	.empty {
		color: #435a80;
		text-align: center;
		padding: 1rem;
		font-size: 0.875rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		text-align: left;
		padding: 0.375rem 0.5rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #435a80;
		border-bottom: 1px solid #243254;
		font-weight: 500;
	}

	td {
		padding: 0.5rem 0.5rem;
		font-size: 0.8125rem;
		border-bottom: 1px solid #1a2744;
		color: #607a9c;
	}

	tr:last-child td {
		border-bottom: none;
	}

	.name {
		color: #fff;
		font-weight: 500;
	}

	.admin-tag {
		font-size: 0.6875rem;
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.15);
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.role {
		font-size: 0.6875rem;
		color: #607a9c;
	}

	.link-col {
		text-align: right;
	}

	.copy-link-btn {
		padding: 0.25rem 0.625rem;
		background: transparent;
		border: 1px solid #243254;
		border-radius: 4px;
		color: #607a9c;
		font-size: 0.75rem;
	}

	.copy-link-btn:hover {
		border-color: #3d5078;
		color: #8498b5;
	}
</style>
