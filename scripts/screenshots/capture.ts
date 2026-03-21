import type { Page } from '@playwright/test';
import { join } from 'path';
import { BASE_URL, OUTPUT_DIR } from './constants';

async function screenshot(page: Page, name: string): Promise<void> {
	await page.screenshot({ path: join(OUTPUT_DIR, name), type: 'png' });
	console.log(`  captured ${name}`);
}

async function waitForApp(page: Page): Promise<void> {
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(300);
}

export async function captureDesktop(page: Page, mainTripId: string): Promise<void> {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	console.log('Capturing desktop screenshots...');

	// D1: Trip list
	await page.goto(BASE_URL);
	await waitForApp(page);
	await screenshot(page, 'screenshot-trips.png');

	// D2: Trip dashboard (Lisbon — ongoing with budget + expenses)
	await page.goto(`${BASE_URL}/trips/${mainTripId}`);
	await waitForApp(page);
	await screenshot(page, 'screenshot-dashboard.png');

	// D3: Expense list
	await page.goto(`${BASE_URL}/trips/${mainTripId}/expenses`);
	await waitForApp(page);
	await screenshot(page, 'screenshot-expenses.png');
}

export async function captureMobile(page: Page, mainTripId: string): Promise<void> {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	console.log('Capturing mobile screenshots...');

	// M1: Mobile trip list
	await page.goto(BASE_URL);
	await waitForApp(page);
	await screenshot(page, 'screenshot-mobile-trips.png');

	// M2: Mobile dashboard
	await page.goto(`${BASE_URL}/trips/${mainTripId}`);
	await waitForApp(page);
	await screenshot(page, 'screenshot-mobile-dashboard.png');

	// M3: Mobile expense list
	await page.goto(`${BASE_URL}/trips/${mainTripId}/expenses`);
	await waitForApp(page);
	await screenshot(page, 'screenshot-mobile-expenses.png');
}
