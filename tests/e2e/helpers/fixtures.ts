import { test as base, expect, type Page, type Locator } from '@playwright/test';
import { collectCoverage } from './coverage';

const TEST_EMAIL = 'admin@test.com';
const TEST_PASSWORD = 'testpassword123';
const TEST_DISPLAY_NAME = 'Test Admin';

/** Find a specific trip card by its name text */
export function tripCard(page: Page, name: string): Locator {
	return page.locator('[data-testid="trip-card"]', { hasText: name });
}

/**
 * Extended test fixture that handles setup/auth.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
	authenticatedPage: async ({ page }, use, testInfo) => {
		await setupAndLogin(page);
		await use(page);
		await collectCoverage(page, testInfo.title);
	}
});

export async function setupAndLogin(page: Page) {
	await page.goto('/');

	const url = page.url();
	if (url.includes('/setup')) {
		// First-time setup with email
		await page.getByTestId('email-input').fill(TEST_EMAIL);
		await page.getByTestId('display-name-input').fill(TEST_DISPLAY_NAME);
		await page.getByTestId('password-input').fill(TEST_PASSWORD);
		await page.getByTestId('confirm-password-input').fill(TEST_PASSWORD);
		await page.getByTestId('setup-btn').click();

		try {
			await page.waitForURL('/', { timeout: 5000 });
		} catch {
			// Setup was completed by another worker - go to login instead
			await page.goto('/login');
			await page.getByTestId('email-input').fill(TEST_EMAIL);
			await page.getByTestId('password-input').fill(TEST_PASSWORD);
			await page.getByTestId('login-btn').click();
			await page.waitForURL('/');
		}
	} else if (url.includes('/login')) {
		await page.getByTestId('email-input').fill(TEST_EMAIL);
		await page.getByTestId('password-input').fill(TEST_PASSWORD);
		await page.getByTestId('login-btn').click();
		await page.waitForURL('/');
	}

	await page.waitForLoadState('networkidle');
}

/** Create a trip via the UI. Use in Given steps for state setup. */
export async function createTrip(
	page: Page,
	opts: { name: string; destination?: string; budget?: string }
) {
	await page.getByTestId('new-trip-btn').click();
	await page.getByTestId('trip-name-input').fill(opts.name);
	if (opts.destination) {
		await page.getByTestId('trip-destination-input').fill(opts.destination);
	}
	if (opts.budget) {
		await page.getByTestId('trip-budget-input').fill(opts.budget);
	}
	await page.getByTestId('trip-save-btn').click();
	// Should redirect to the trip dashboard
	await page.waitForURL(/\/trips\/.+/);
}

/** Add an expense to the current trip. Assumes we're on a trip page. */
export async function addExpense(
	page: Page,
	opts: { amount: string; category?: string; note?: string }
) {
	await page.getByTestId('add-expense-btn').click();
	await page.getByTestId('expense-amount-input').fill(opts.amount);
	if (opts.category) {
		await page.getByTestId(`category-${opts.category}`).click();
	}
	if (opts.note) {
		await page.getByTestId('expense-note-input').fill(opts.note);
	}
	await page.getByTestId('expense-save-btn').click();
	// Should redirect back to expenses or trip page
	await page.waitForURL(/\/trips\/.+/);
}

export { expect, TEST_EMAIL, TEST_PASSWORD };
