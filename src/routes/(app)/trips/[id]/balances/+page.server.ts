import type { PageServerLoad } from './$types';
import { getBalances } from '$lib/server/settlements-service';
import { canAccessTrip } from '$lib/server/collaborators';
import { getTrip } from '$lib/server/trips-service';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const userId = locals.user!.id;
	const access = canAccessTrip(params.id, userId);
	if (!access.canAccess) throw redirect(302, '/');

	const trip = getTrip(params.id, userId);
	if (trip?.splitExpenses === false) throw redirect(302, `/trips/${params.id}`);

	const { balances, transfers, members } = getBalances(params.id);
	return { tripId: params.id, balances, transfers, members };
};
