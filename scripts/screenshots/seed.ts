import type { Page } from '@playwright/test';
import { BASE_URL, ADMIN } from './constants';

type HttpMethod = 'post' | 'put' | 'get' | 'delete';

async function api(page: Page, method: HttpMethod, path: string, data?: unknown) {
	const res = await page.request[method](
		`${BASE_URL}${path}`,
		data !== undefined ? { data } : undefined
	);
	if (!res.ok()) {
		throw new Error(`${method.toUpperCase()} ${path} failed: ${res.status()} ${await res.text()}`);
	}
	const text = await res.text();
	return text ? JSON.parse(text) : {};
}

/** Convert euros to cents */
function eur(amount: number): number {
	return Math.round(amount * 100);
}

export async function seed(page: Page): Promise<{ mainTripId: string }> {
	// 1. Setup admin
	await api(page, 'post', '/api/auth/setup', {
		email: ADMIN.email,
		displayName: ADMIN.displayName,
		password: ADMIN.password
	});
	console.log('  admin created');

	// 2. Create trips
	// Trip dates designed so "Lisbon" is ongoing with good dashboard data
	const today = new Date();
	const startedDaysAgo = 5;
	const tripDuration = 10;
	const lisbonStart = new Date(today);
	lisbonStart.setDate(today.getDate() - startedDaysAgo);
	const lisbonEnd = new Date(lisbonStart);
	lisbonEnd.setDate(lisbonStart.getDate() + tripDuration);

	const tokyoStart = new Date(today);
	tokyoStart.setDate(today.getDate() + 30);
	const tokyoEnd = new Date(tokyoStart);
	tokyoEnd.setDate(tokyoStart.getDate() + 14);

	const fmt = (d: Date) => d.toISOString().split('T')[0];

	// Completed trip (simple, no budget)
	await api(page, 'post', '/api/trips', {
		name: 'Amsterdam Weekend',
		destination: 'Amsterdam, Netherlands',
		startDate: '2025-11-15',
		endDate: '2025-11-18',
		numberOfPeople: 2,
		totalBudget: null,
		homeCurrency: 'EUR'
	});
	console.log('  trip created: Amsterdam Weekend');

	// Future trip
	const tokyo = await api(page, 'post', '/api/trips', {
		name: 'Tokyo Adventure',
		destination: 'Tokyo, Japan',
		startDate: fmt(tokyoStart),
		endDate: fmt(tokyoEnd),
		numberOfPeople: 2,
		totalBudget: eur(4000),
		homeCurrency: 'EUR'
	});
	console.log('  trip created: Tokyo Adventure');

	// Main trip (ongoing, with budget) — this is the dashboard hero
	const lisbon = await api(page, 'post', '/api/trips', {
		name: 'Lisbon & Sintra',
		destination: 'Lisbon, Portugal',
		startDate: fmt(lisbonStart),
		endDate: fmt(lisbonEnd),
		numberOfPeople: 2,
		totalBudget: eur(1500),
		homeCurrency: 'EUR'
	});
	console.log('  trip created: Lisbon & Sintra');

	// 3. Set exchange rates for Tokyo trip (JPY)
	await api(page, 'put', `/api/trips/${tokyo.id}/currencies`, [
		{ currencyCode: 'JPY', exchangeRate: '0.006' }
	]);

	// 4. Add expenses to Lisbon trip (main dashboard)
	const lisbonExpenses = [
		// Pre-trip booking
		{ amount: eur(85), currency: 'EUR', exchangeRate: '1', categoryId: 'transport', date: fmt(new Date(lisbonStart.getTime() - 14 * 86400000)), note: 'Ryanair flights' },
		{ amount: eur(320), currency: 'EUR', exchangeRate: '1', categoryId: 'accommodation', date: fmt(new Date(lisbonStart.getTime() - 7 * 86400000)), note: 'Airbnb Alfama 10 nights' },
		// Day 1
		{ amount: eur(12.5), currency: 'EUR', exchangeRate: '1', categoryId: 'food', date: fmt(lisbonStart), note: 'Pastéis de Belém' },
		{ amount: eur(28), currency: 'EUR', exchangeRate: '1', categoryId: 'food', date: fmt(lisbonStart), note: 'Dinner at Time Out Market' },
		{ amount: eur(7), currency: 'EUR', exchangeRate: '1', categoryId: 'transport', date: fmt(lisbonStart), note: 'Tram 28 day pass' },
		// Day 2
		{ amount: eur(15), currency: 'EUR', exchangeRate: '1', categoryId: 'activities', date: fmt(new Date(lisbonStart.getTime() + 86400000)), note: 'Jerónimos Monastery' },
		{ amount: eur(35), currency: 'EUR', exchangeRate: '1', categoryId: 'food', date: fmt(new Date(lisbonStart.getTime() + 86400000)), note: 'Seafood lunch Cervejaria Ramiro' },
		{ amount: eur(22), currency: 'EUR', exchangeRate: '1', categoryId: 'shopping', date: fmt(new Date(lisbonStart.getTime() + 86400000)), note: 'Azulejo tiles souvenir' },
		// Day 3
		{ amount: eur(14), currency: 'EUR', exchangeRate: '1', categoryId: 'transport', date: fmt(new Date(lisbonStart.getTime() + 2 * 86400000)), note: 'Train to Sintra' },
		{ amount: eur(20), currency: 'EUR', exchangeRate: '1', categoryId: 'activities', date: fmt(new Date(lisbonStart.getTime() + 2 * 86400000)), note: 'Pena Palace ticket' },
		{ amount: eur(18), currency: 'EUR', exchangeRate: '1', categoryId: 'food', date: fmt(new Date(lisbonStart.getTime() + 2 * 86400000)), note: 'Lunch in Sintra' },
		// Day 4
		{ amount: eur(42), currency: 'EUR', exchangeRate: '1', categoryId: 'food', date: fmt(new Date(lisbonStart.getTime() + 3 * 86400000)), note: 'Dinner Belcanto' },
		{ amount: eur(8), currency: 'EUR', exchangeRate: '1', categoryId: 'food', date: fmt(new Date(lisbonStart.getTime() + 3 * 86400000)), note: 'Ginjinha shots' },
		{ amount: eur(35), currency: 'EUR', exchangeRate: '1', categoryId: 'shopping', date: fmt(new Date(lisbonStart.getTime() + 3 * 86400000)), note: 'Cork bag from LX Factory' },
		// Day 5
		{ amount: eur(12), currency: 'EUR', exchangeRate: '1', categoryId: 'activities', date: fmt(new Date(lisbonStart.getTime() + 4 * 86400000)), note: 'Fado show cover' },
		{ amount: eur(25), currency: 'EUR', exchangeRate: '1', categoryId: 'food', date: fmt(new Date(lisbonStart.getTime() + 4 * 86400000)), note: 'Dinner at fado house' },
		{ amount: eur(6), currency: 'EUR', exchangeRate: '1', categoryId: 'misc', date: fmt(new Date(lisbonStart.getTime() + 4 * 86400000)), note: 'Laundry' },
	];

	for (const expense of lisbonExpenses) {
		await api(page, 'post', `/api/trips/${lisbon.id}/expenses`, expense);
	}
	console.log(`  ${lisbonExpenses.length} expenses added to Lisbon & Sintra`);

	// 5. Add a few expenses to Tokyo (pre-trip bookings)
	const tokyoExpenses = [
		{ amount: eur(450), currency: 'EUR', exchangeRate: '1', categoryId: 'transport', date: fmt(new Date(tokyoStart.getTime() - 30 * 86400000)), note: 'ANA flights' },
		{ amount: 38000, currency: 'JPY', exchangeRate: '0.006', categoryId: 'accommodation', date: fmt(new Date(tokyoStart.getTime() - 14 * 86400000)), note: 'Hotel Shinjuku 14 nights' },
	];

	for (const expense of tokyoExpenses) {
		await api(page, 'post', `/api/trips/${tokyo.id}/expenses`, expense);
	}
	console.log('  2 expenses added to Tokyo Adventure');

	return { mainTripId: lisbon.id };
}

export async function login(page: Page): Promise<void> {
	await page.goto(`${BASE_URL}/login`);
	await page.getByTestId('email-input').fill(ADMIN.email);
	await page.getByTestId('password-input').fill(ADMIN.password);
	await page.getByTestId('login-btn').click();
	await page.waitForURL('**/');
	await page.waitForLoadState('networkidle');
}
