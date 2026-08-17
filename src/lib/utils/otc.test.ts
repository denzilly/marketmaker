import { describe, it, expect } from 'vitest';
import {
	validateProposal,
	tradeParties,
	acceptorSide,
	describeOutgoing,
	describeIncoming,
	incomingActionLabel,
	wasAmended,
	isPendingIncoming,
	isPendingOutgoing,
	involves
} from './otc';
import type { OtcProposal } from '$lib/types/database';

const baseDraft = {
	assetId: 'asset-1',
	counterpartyId: 'bob',
	side: 'buy' as const,
	price: '12',
	size: '5'
};

function proposal(overrides: Partial<OtcProposal> = {}): OtcProposal {
	return {
		id: 'p1',
		market_id: 'm1',
		asset_id: 'asset-1',
		proposer_id: 'anna',
		counterparty_id: 'bob',
		side: 'buy',
		price: 12,
		size: 5,
		status: 'pending',
		trade_id: null,
		created_at: '2026-08-17T10:00:00.000Z',
		updated_at: '2026-08-17T10:00:00.000Z',
		resolved_at: null,
		...overrides
	};
}

describe('validateProposal', () => {
	it('accepts a well-formed draft', () => {
		const result = validateProposal(baseDraft);
		expect(result).toEqual({ ok: true, value: { price: 12, size: 5 } });
	});

	it('accepts negative and zero prices (spread bets)', () => {
		expect(validateProposal({ ...baseDraft, price: '-3.5' })).toEqual({
			ok: true,
			value: { price: -3.5, size: 5 }
		});
		expect(validateProposal({ ...baseDraft, price: '0' })).toEqual({
			ok: true,
			value: { price: 0, size: 5 }
		});
	});

	it('rejects more than one decimal place', () => {
		const result = validateProposal({ ...baseDraft, price: '12.25' });
		expect(result.ok).toBe(false);
	});

	it('rejects a missing asset or counterparty', () => {
		expect(validateProposal({ ...baseDraft, assetId: '' }).ok).toBe(false);
		expect(validateProposal({ ...baseDraft, counterpartyId: '' }).ok).toBe(false);
	});

	it('rejects non-positive or non-numeric sizes', () => {
		expect(validateProposal({ ...baseDraft, size: '0' }).ok).toBe(false);
		expect(validateProposal({ ...baseDraft, size: '-2' }).ok).toBe(false);
		expect(validateProposal({ ...baseDraft, size: '' }).ok).toBe(false);
		expect(validateProposal({ ...baseDraft, price: 'abc' }).ok).toBe(false);
	});
});

describe('tradeParties', () => {
	it('makes the proposer the buyer on a bid', () => {
		expect(tradeParties(proposal({ side: 'buy' }))).toEqual({ buyerId: 'anna', sellerId: 'bob' });
	});

	it('makes the proposer the seller on an offer', () => {
		expect(tradeParties(proposal({ side: 'sell' }))).toEqual({ buyerId: 'bob', sellerId: 'anna' });
	});
});

describe('acceptorSide', () => {
	it('is the mirror of the proposer side (the acceptor is the aggressor)', () => {
		expect(acceptorSide('buy')).toBe('sell');
		expect(acceptorSide('sell')).toBe('buy');
	});
});

describe('descriptions', () => {
	it('phrases outgoing proposals from the proposer perspective', () => {
		expect(describeOutgoing('buy', 5, 'WIDGET', 12, 'Bob')).toBe('You buy 5 WIDGET @ 12 from Bob');
		expect(describeOutgoing('sell', 5, 'WIDGET', 12, 'Bob')).toBe('You sell 5 WIDGET @ 12 to Bob');
	});

	it('phrases incoming proposals from the receiver perspective', () => {
		expect(describeIncoming('buy', 5, 'WIDGET', 12, 'Anna')).toBe(
			'Anna wants to buy 5 WIDGET @ 12 from you'
		);
		expect(describeIncoming('sell', 5, 'WIDGET', 12, 'Anna')).toBe(
			'Anna wants to sell you 5 WIDGET @ 12'
		);
	});

	it('labels the receiver action as the opposite side', () => {
		expect(incomingActionLabel('buy')).toBe('You sell');
		expect(incomingActionLabel('sell')).toBe('You buy');
	});
});

describe('wasAmended', () => {
	it('is false for a freshly created proposal', () => {
		expect(wasAmended(proposal())).toBe(false);
	});

	it('is true once the terms are updated', () => {
		expect(wasAmended(proposal({ updated_at: '2026-08-17T10:05:00.000Z' }))).toBe(true);
	});
});

describe('participant filters', () => {
	it('splits pending proposals into incoming and outgoing', () => {
		const p = proposal();
		expect(isPendingIncoming(p, 'bob')).toBe(true);
		expect(isPendingIncoming(p, 'anna')).toBe(false);
		expect(isPendingOutgoing(p, 'anna')).toBe(true);
		expect(isPendingOutgoing(p, 'bob')).toBe(false);
	});

	it('ignores resolved proposals', () => {
		const done = proposal({ status: 'accepted' });
		expect(isPendingIncoming(done, 'bob')).toBe(false);
		expect(isPendingOutgoing(done, 'anna')).toBe(false);
	});

	it('recognises both parties', () => {
		const p = proposal();
		expect(involves(p, 'anna')).toBe(true);
		expect(involves(p, 'bob')).toBe(true);
		expect(involves(p, 'carol')).toBe(false);
	});
});
