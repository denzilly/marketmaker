<script lang="ts">
	import { afterUpdate, tick } from 'svelte';
	import { supabase } from '$lib/supabase';
	import type { Message } from '$lib/types/database';

	export let messages: Message[] = [];
	export let participants: Array<{ id: string; name: string }> = [];
	export let participantId: string;
	export let marketId: string;

	let messageText = '';
	let sending = false;
	let messagesContainer: HTMLDivElement;
	let shouldAutoScroll = true;

	function getParticipantName(pid: string): string {
		return participants.find((p) => p.id === pid)?.name ?? 'Unknown';
	}

	function formatTime(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function handleScroll() {
		if (!messagesContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
		shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 40;
	}

	afterUpdate(() => {
		if (shouldAutoScroll && messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});

	async function sendMessage() {
		const content = messageText.trim();
		if (!content || sending) return;

		sending = true;
		try {
			const { error } = await supabase.from('messages').insert({
				market_id: marketId,
				participant_id: participantId,
				content
			});
			if (error) throw error;
			messageText = '';
			shouldAutoScroll = true;
		} catch (e) {
			console.error('Failed to send message:', e);
		} finally {
			sending = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}
</script>

<div class="chat-panel">
	<div class="section-header">
		<h2>Chat</h2>
	</div>
	<div class="messages" bind:this={messagesContainer} on:scroll={handleScroll}>
		{#if messages.length === 0}
			<p class="empty">No messages yet.</p>
		{:else}
			{#each messages as msg (msg.id)}
				<div class="message" class:own={msg.participant_id === participantId}>
					<span class="msg-name">{getParticipantName(msg.participant_id)}</span>
					<span class="msg-text">{msg.content}</span>
					<span class="msg-time">{formatTime(msg.created_at)}</span>
				</div>
			{/each}
		{/if}
	</div>
	<div class="input-area">
		<input
			type="text"
			bind:value={messageText}
			on:keydown={handleKeydown}
			placeholder="Type a message..."
			disabled={sending}
			maxlength="500"
		/>
		<button on:click={sendMessage} disabled={sending || !messageText.trim()}>Send</button>
	</div>
</div>

<style>
	.chat-panel {
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

	.messages {
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

	.message {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.25rem 0;
		font-size: 0.8125rem;
	}

	.message.own .msg-name {
		color: #7ec8ff;
	}

	.msg-name {
		color: #8498b5;
		font-weight: 600;
		flex-shrink: 0;
	}

	.msg-text {
		color: #c5d0e3;
		word-break: break-word;
		flex: 1;
	}

	.msg-time {
		color: #435a80;
		font-size: 0.6875rem;
		flex-shrink: 0;
	}

	.input-area {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
		border-top: 1px solid #243254;
		padding-top: 0.5rem;
	}

	.input-area input {
		flex: 1;
		background: #0a1020;
		border: 1px solid #243254;
		color: #c5d0e3;
		padding: 0.5rem 0.75rem;
		font-size: 0.8125rem;
		font-family: inherit;
	}

	.input-area input:focus {
		outline: none;
		border-color: #7ec8ff;
	}

	.input-area input::placeholder {
		color: #435a80;
	}

	.input-area button {
		background: #2563eb;
		border: none;
		color: #fff;
		padding: 0.5rem 1rem;
		font-size: 0.8125rem;
		font-family: inherit;
		font-weight: 500;
	}

	.input-area button:hover:not(:disabled) {
		background: #3b82f6;
	}

	.input-area button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
