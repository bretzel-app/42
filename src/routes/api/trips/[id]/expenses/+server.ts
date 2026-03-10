import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { listExpenses, createExpense } from '$lib/server/expenses-service.js';

export const GET: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	return json(listExpenses(params.id, userId));
};

export const POST: RequestHandler = async ({ params, request, ...event }) => {
	const userId = getUserId(event);
	const data = await request.json();
	data.tripId = params.id;

	if (!data.amount && data.amount !== 0) {
		throw error(400, 'Amount is required');
	}

	const expense = createExpense(data, userId);
	if (!expense) throw error(404, 'Trip not found');
	return json(expense, { status: 201 });
};
