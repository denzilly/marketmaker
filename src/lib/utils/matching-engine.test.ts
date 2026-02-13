import { describe, test, expect } from 'vitest';
import { computeMatches } from './matching-engine';
import type { Order } from '$lib/types/database';

// Helper to create test orders with sensible defaults
let orderCounter = 0;
function makeOrder(overrides: Partial<Order> & Pick<Order, 'side' | 'price'>): Order {
	orderCounter++;
	return {
		id: `order-${orderCounter}`,
		asset_id: 'asset-1',
		participant_id: 'participant-A',
		size: 1,
		remaining_size: 1,
		status: 'open',
		created_at: new Date(2024, 0, 1, 0, 0, orderCounter).toISOString(),
		...overrides
	};
}

describe('computeMatches', () => {
	// --- Basic matching ---

	test('buy order matches the best (lowest) sell', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 55,
			size: 3,
			remaining_size: 3,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({ side: 'sell', price: 53, participant_id: 'seller-1' }),
			makeOrder({ side: 'sell', price: 50, participant_id: 'seller-2' }),
			makeOrder({ side: 'sell', price: 51, participant_id: 'seller-3' })
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(3);
		// Should match lowest price first
		expect(matches[0].tradePrice).toBe(50);
		expect(matches[1].tradePrice).toBe(51);
		expect(matches[2].tradePrice).toBe(53);
	});

	test('sell order matches the best (highest) buy', () => {
		const incoming = makeOrder({
			side: 'sell',
			price: 45,
			size: 3,
			remaining_size: 3,
			participant_id: 'seller'
		});
		const existing = [
			makeOrder({ side: 'buy', price: 47, participant_id: 'buyer-1' }),
			makeOrder({ side: 'buy', price: 50, participant_id: 'buyer-2' }),
			makeOrder({ side: 'buy', price: 48, participant_id: 'buyer-3' })
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(3);
		// Should match highest price first
		expect(matches[0].tradePrice).toBe(50);
		expect(matches[1].tradePrice).toBe(48);
		expect(matches[2].tradePrice).toBe(47);
	});

	// --- No match scenarios ---

	test('no match when prices do not cross', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 49,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({ side: 'sell', price: 50, participant_id: 'seller-1' }),
			makeOrder({ side: 'sell', price: 55, participant_id: 'seller-2' })
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(0);
	});

	test('no match for same-side orders', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({ side: 'buy', price: 48, participant_id: 'buyer-2' }),
			makeOrder({ side: 'buy', price: 52, participant_id: 'buyer-3' })
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(0);
	});

	test('no match for different asset', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			asset_id: 'asset-A',
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({
				side: 'sell',
				price: 45,
				asset_id: 'asset-B',
				participant_id: 'seller'
			})
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(0);
	});

	// --- Self-trading prevention ---

	test('does not match against own orders', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 55,
			participant_id: 'trader-1'
		});
		const existing = [
			makeOrder({ side: 'sell', price: 50, participant_id: 'trader-1' }), // same person
			makeOrder({ side: 'sell', price: 52, participant_id: 'trader-2' }) // different person
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(1);
		expect(matches[0].tradePrice).toBe(52);
	});

	// --- Trade executes at resting order's price ---

	test('trade executes at resting order price, not incoming', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 60,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({ side: 'sell', price: 50, participant_id: 'seller' })
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(1);
		expect(matches[0].tradePrice).toBe(50); // resting price, not 60
	});

	// --- Partial fills ---

	test('partial fill when incoming order is larger than resting', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			size: 5,
			remaining_size: 5,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({
				side: 'sell',
				price: 50,
				size: 3,
				remaining_size: 3,
				participant_id: 'seller'
			})
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(1);
		expect(matches[0].fillSize).toBe(3); // limited by resting order
	});

	test('partial fill when resting order is larger than incoming', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			size: 2,
			remaining_size: 2,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({
				side: 'sell',
				price: 50,
				size: 5,
				remaining_size: 5,
				participant_id: 'seller'
			})
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(1);
		expect(matches[0].fillSize).toBe(2); // limited by incoming order
	});

	// --- Multiple fills ---

	test('fills across multiple resting orders', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 55,
			size: 10,
			remaining_size: 10,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({
				side: 'sell',
				price: 50,
				size: 3,
				remaining_size: 3,
				participant_id: 'seller-1'
			}),
			makeOrder({
				side: 'sell',
				price: 52,
				size: 4,
				remaining_size: 4,
				participant_id: 'seller-2'
			}),
			makeOrder({
				side: 'sell',
				price: 54,
				size: 5,
				remaining_size: 5,
				participant_id: 'seller-3'
			})
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(3);
		expect(matches[0].fillSize).toBe(3); // 50
		expect(matches[1].fillSize).toBe(4); // 52
		expect(matches[2].fillSize).toBe(3); // 54, only 3 remaining from incoming
	});

	// --- FIFO at same price ---

	test('FIFO: earlier order matches first at same price', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			size: 1,
			remaining_size: 1,
			participant_id: 'buyer'
		});

		const earlyTime = new Date(2024, 0, 1, 10, 0, 0).toISOString();
		const lateTime = new Date(2024, 0, 1, 10, 5, 0).toISOString();

		const existing = [
			makeOrder({
				id: 'late-order',
				side: 'sell',
				price: 50,
				participant_id: 'seller-2',
				created_at: lateTime
			}),
			makeOrder({
				id: 'early-order',
				side: 'sell',
				price: 50,
				participant_id: 'seller-1',
				created_at: earlyTime
			})
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(1);
		expect(matches[0].restingOrderId).toBe('early-order');
	});

	// --- Skips non-open / zero-size orders ---

	test('skips cancelled orders', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({
				side: 'sell',
				price: 48,
				participant_id: 'seller-1',
				status: 'cancelled'
			}),
			makeOrder({ side: 'sell', price: 49, participant_id: 'seller-2' })
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(1);
		expect(matches[0].tradePrice).toBe(49);
	});

	test('skips filled orders', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({
				side: 'sell',
				price: 48,
				participant_id: 'seller-1',
				status: 'filled',
				remaining_size: 0
			})
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(0);
	});

	test('skips orders with zero remaining size', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({
				side: 'sell',
				price: 48,
				participant_id: 'seller-1',
				remaining_size: 0
			})
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(0);
	});

	// --- Buyer/seller ID assignment ---

	test('correctly assigns buyer and seller for buy incoming', () => {
		const incoming = makeOrder({
			id: 'buy-order',
			side: 'buy',
			price: 50,
			participant_id: 'the-buyer'
		});
		const existing = [
			makeOrder({
				id: 'sell-order',
				side: 'sell',
				price: 50,
				participant_id: 'the-seller'
			})
		];

		const matches = computeMatches(incoming, existing);
		expect(matches[0].buyerId).toBe('the-buyer');
		expect(matches[0].sellerId).toBe('the-seller');
		expect(matches[0].buyOrderId).toBe('buy-order');
		expect(matches[0].sellOrderId).toBe('sell-order');
	});

	test('correctly assigns buyer and seller for sell incoming', () => {
		const incoming = makeOrder({
			id: 'sell-order',
			side: 'sell',
			price: 50,
			participant_id: 'the-seller'
		});
		const existing = [
			makeOrder({
				id: 'buy-order',
				side: 'buy',
				price: 50,
				participant_id: 'the-buyer'
			})
		];

		const matches = computeMatches(incoming, existing);
		expect(matches[0].buyerId).toBe('the-buyer');
		expect(matches[0].sellerId).toBe('the-seller');
		expect(matches[0].buyOrderId).toBe('buy-order');
		expect(matches[0].sellOrderId).toBe('sell-order');
	});

	// --- Edge cases ---

	test('returns empty array when no existing orders', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			participant_id: 'buyer'
		});

		const matches = computeMatches(incoming, []);
		expect(matches).toHaveLength(0);
	});

	test('incoming order with zero remaining size produces no matches', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			remaining_size: 0,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({ side: 'sell', price: 48, participant_id: 'seller' })
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(0);
	});

	test('exact price crossing (buy at 50, sell at 50) matches', () => {
		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({ side: 'sell', price: 50, participant_id: 'seller' })
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(1);
		expect(matches[0].tradePrice).toBe(50);
	});

	// --- Amendment scenarios ---
	// These test that after an order is amended (price/size/timestamp changed),
	// matching behaves correctly.

	test('amended order with new crossing price matches existing orders', () => {
		// Simulates: sell order was at 55 (no cross), amended down to 48 (crosses the bid)
		const amended = makeOrder({
			side: 'sell',
			price: 48, // amended from 55 to 48
			size: 2,
			remaining_size: 2,
			participant_id: 'seller'
		});
		const existing = [
			makeOrder({ side: 'buy', price: 50, participant_id: 'buyer' })
		];

		const matches = computeMatches(amended, existing);
		expect(matches).toHaveLength(1);
		expect(matches[0].tradePrice).toBe(50); // executes at resting bid
		expect(matches[0].fillSize).toBe(1);
	});

	test('amended order with non-crossing price still does not match', () => {
		// Simulates: buy order amended from 45 to 48, but best offer is at 50
		const amended = makeOrder({
			side: 'buy',
			price: 48,
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({ side: 'sell', price: 50, participant_id: 'seller' })
		];

		const matches = computeMatches(amended, existing);
		expect(matches).toHaveLength(0);
	});

	test('amended order with increased size fills more contracts', () => {
		// Simulates: buy order size amended from 1 to 5, matching against multiple sells
		const amended = makeOrder({
			side: 'buy',
			price: 55,
			size: 5,
			remaining_size: 5, // increased from original
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({ side: 'sell', price: 50, size: 2, remaining_size: 2, participant_id: 'seller-1' }),
			makeOrder({ side: 'sell', price: 52, size: 3, remaining_size: 3, participant_id: 'seller-2' })
		];

		const matches = computeMatches(amended, existing);
		expect(matches).toHaveLength(2);
		expect(matches[0].fillSize).toBe(2);
		expect(matches[1].fillSize).toBe(3);
	});

	test('amended order with decreased size fills fewer contracts', () => {
		// Simulates: buy order remaining_size amended from 5 to 1
		const amended = makeOrder({
			side: 'buy',
			price: 55,
			size: 5,
			remaining_size: 1, // decreased
			participant_id: 'buyer'
		});
		const existing = [
			makeOrder({ side: 'sell', price: 50, size: 3, remaining_size: 3, participant_id: 'seller-1' }),
			makeOrder({ side: 'sell', price: 52, size: 3, remaining_size: 3, participant_id: 'seller-2' })
		];

		const matches = computeMatches(amended, existing);
		expect(matches).toHaveLength(1);
		expect(matches[0].fillSize).toBe(1);
	});

	test('amended order with reset timestamp loses priority at same price', () => {
		// Simulates: order at price 50 was amended (price changed), so created_at is reset to now.
		// Another order at the same price with an older timestamp should have priority.
		const earlyTime = new Date(2024, 0, 1, 10, 0, 0).toISOString();
		const amendedTime = new Date(2024, 0, 1, 12, 0, 0).toISOString(); // later = lost priority

		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			size: 1,
			remaining_size: 1,
			participant_id: 'buyer'
		});

		const existing = [
			makeOrder({
				id: 'amended-sell',
				side: 'sell',
				price: 50,
				participant_id: 'seller-1',
				created_at: amendedTime // reset after amendment
			}),
			makeOrder({
				id: 'original-sell',
				side: 'sell',
				price: 50,
				participant_id: 'seller-2',
				created_at: earlyTime // original, earlier
			})
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(1);
		// The original (earlier) order should match first
		expect(matches[0].restingOrderId).toBe('original-sell');
	});

	test('amended order keeps priority when only size changed (timestamp unchanged)', () => {
		// Size-only change preserves created_at, so order keeps its queue position
		const earlyTime = new Date(2024, 0, 1, 10, 0, 0).toISOString();
		const lateTime = new Date(2024, 0, 1, 12, 0, 0).toISOString();

		const incoming = makeOrder({
			side: 'buy',
			price: 50,
			size: 1,
			remaining_size: 1,
			participant_id: 'buyer'
		});

		const existing = [
			makeOrder({
				id: 'size-amended-sell',
				side: 'sell',
				price: 50,
				size: 5,
				remaining_size: 3, // size amended but timestamp preserved
				participant_id: 'seller-1',
				created_at: earlyTime
			}),
			makeOrder({
				id: 'newer-sell',
				side: 'sell',
				price: 50,
				participant_id: 'seller-2',
				created_at: lateTime
			})
		];

		const matches = computeMatches(incoming, existing);
		expect(matches).toHaveLength(1);
		// Size-amended order keeps its earlier timestamp, so it matches first
		expect(matches[0].restingOrderId).toBe('size-amended-sell');
	});
});
