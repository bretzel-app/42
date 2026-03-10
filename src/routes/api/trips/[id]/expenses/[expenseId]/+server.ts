import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId } from '$lib/server/api-utils.js';
import { updateExpense, deleteExpense } from '$lib/server/expenses-service.js';

export const PATCH: RequestHandler = async ({ params, request, ...event }) => {
	const userId = getUserId(event);
	const data = await request.json();
	const expense = updateExpense(params.expenseId, params.id, data, userId);
	if (!expense) throw error(404, 'Expense not found');
	return json(expense);
};

export const DELETE: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	const success = deleteExpense(params.expenseId, params.id, userId);
	if (!success) throw error(404, 'Expense not found');
	return json({ success: true });
};
