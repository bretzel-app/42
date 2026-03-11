import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getUserId, requireTripAccess } from '$lib/server/api-utils.js';
import { db } from '$lib/server/db/index.js';
import { tripCurrencies } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, ...event }) => {
	const userId = getUserId(event);
	requireTripAccess(db, params.id, userId);

	const currencies = db
		.select()
		.from(tripCurrencies)
		.where(eq(tripCurrencies.tripId, params.id))
		.all();

	return json(currencies);
};

export const PUT: RequestHandler = async ({ params, request, ...event }) => {
	const userId = getUserId(event);
	requireTripAccess(db, params.id, userId);

	const body: { currencyCode: string; exchangeRate: string }[] = await request.json();

	if (!Array.isArray(body)) {
		throw error(400, 'Expected an array of currency rates');
	}

	const now = new Date();
	for (const { currencyCode, exchangeRate } of body) {
		if (!currencyCode || !exchangeRate) continue;
		db.insert(tripCurrencies)
			.values({
				tripId: params.id,
				currencyCode,
				exchangeRate,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [tripCurrencies.tripId, tripCurrencies.currencyCode],
				set: { exchangeRate, updatedAt: now }
			})
			.run();
	}

	const updated = db
		.select()
		.from(tripCurrencies)
		.where(eq(tripCurrencies.tripId, params.id))
		.all();

	return json(updated);
};
