// Word lists for generating memorable market codes
const adjectives = [
	'red', 'blue', 'green', 'gold', 'silver', 'quick', 'calm', 'bold',
	'warm', 'cool', 'wild', 'soft', 'bright', 'dark', 'swift', 'slow',
	'happy', 'lucky', 'quiet', 'loud', 'sweet', 'fresh', 'crisp', 'smooth'
];

const animals = [
	'tiger', 'eagle', 'wolf', 'bear', 'fox', 'hawk', 'lion', 'whale',
	'shark', 'raven', 'cobra', 'panda', 'otter', 'falcon', 'badger', 'moose',
	'bison', 'crane', 'heron', 'viper', 'gecko', 'koala', 'lemur', 'manta'
];

const nouns = [
	'moon', 'star', 'sun', 'cloud', 'river', 'stone', 'flame', 'frost',
	'wave', 'peak', 'storm', 'dawn', 'dusk', 'rain', 'snow', 'wind',
	'forest', 'ocean', 'desert', 'canyon', 'valley', 'island', 'meadow', 'cliff'
];

function randomElement<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates a memorable market code like "quick-tiger-moon"
 */
export function generateMarketCode(): string {
	const adjective = randomElement(adjectives);
	const animal = randomElement(animals);
	const noun = randomElement(nouns);
	return `${adjective}-${animal}-${noun}`;
}

/**
 * Validates a market code format
 */
export function isValidMarketCode(code: string): boolean {
	const parts = code.toLowerCase().split('-');
	return parts.length === 3 && parts.every((part) => part.length >= 2);
}
