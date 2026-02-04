import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url }) => {
	const code = params.code;
	const participantToken = url.searchParams.get('p');
	const name = url.searchParams.get('name');
	const isCreate = url.searchParams.get('create') === 'true';

	// TODO:
	// 1. If participantToken exists, validate it and load participant data
	// 2. If name exists (new join/create), create participant and return token
	// 3. Load market data from Supabase

	return {
		code,
		participantToken,
		name,
		isCreate
	};
};
