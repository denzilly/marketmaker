import { describe, test, expect } from 'vitest';
import { generateMarketCode, isValidMarketCode } from './market-code';

describe('generateMarketCode', () => {
	test('returns format "word-word-word"', () => {
		const code = generateMarketCode();
		const parts = code.split('-');
		expect(parts).toHaveLength(3);
		parts.forEach((part) => {
			expect(part.length).toBeGreaterThanOrEqual(2);
			expect(part).toMatch(/^[a-z]+$/);
		});
	});

	test('generates different codes on successive calls', () => {
		const codes = new Set<string>();
		for (let i = 0; i < 20; i++) {
			codes.add(generateMarketCode());
		}
		// With 24*24*24 = 13,824 possible codes, 20 calls should produce at least 2 unique
		expect(codes.size).toBeGreaterThan(1);
	});

	test('generated codes pass validation', () => {
		for (let i = 0; i < 10; i++) {
			const code = generateMarketCode();
			expect(isValidMarketCode(code)).toBe(true);
		}
	});
});

describe('isValidMarketCode', () => {
	test('accepts valid three-word codes', () => {
		expect(isValidMarketCode('quick-tiger-moon')).toBe(true);
		expect(isValidMarketCode('red-eagle-star')).toBe(true);
		expect(isValidMarketCode('bold-whale-storm')).toBe(true);
	});

	test('is case-insensitive', () => {
		expect(isValidMarketCode('Quick-Tiger-Moon')).toBe(true);
		expect(isValidMarketCode('QUICK-TIGER-MOON')).toBe(true);
	});

	test('accepts codes with custom words (not just from word lists)', () => {
		expect(isValidMarketCode('foo-bar-baz')).toBe(true);
		expect(isValidMarketCode('my-test-code')).toBe(true);
	});

	test('rejects empty string', () => {
		expect(isValidMarketCode('')).toBe(false);
	});

	test('rejects single word', () => {
		expect(isValidMarketCode('tiger')).toBe(false);
	});

	test('rejects two words', () => {
		expect(isValidMarketCode('quick-tiger')).toBe(false);
	});

	test('rejects four or more words', () => {
		expect(isValidMarketCode('quick-tiger-moon-star')).toBe(false);
	});

	test('rejects single-character parts', () => {
		expect(isValidMarketCode('a-b-c')).toBe(false);
		expect(isValidMarketCode('quick-b-moon')).toBe(false);
	});
});
