import type { PageServerLoad } from './$types';
import { getBalances } from '$lib/server/settlements-service';
import { canAccessTrip } from '$lib/server/collaborators';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = locals.user!.id;
	const access = canAccessTrip(params.id, userId);
	if (!access.canAccess) throw redirect(302, '/');

	const { balances, transfers, members } = getBalances(params.id);
	return { tripId: params.id, balances, transfers, members };
};
