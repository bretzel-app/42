/**
 * Format cents to display string (e.g., 4750 -> "47.50")
 */
export function formatCents(cents: number, currency: string = 'EUR'): string {
	const value = cents / 100;
	try {
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(value);
	} catch {
		return `${value.toFixed(2)} ${currency}`;
	}
}

/**
 * Format cents without currency symbol (e.g., 4750 -> "47.50")
 */
export function formatAmount(cents: number): string {
	return (cents / 100).toFixed(2);
}

/**
 * Parse a display amount string to cents (e.g., "47.50" -> 4750)
 */
export function parseToCents(input: string): number {
	const cleaned = input.replace(/[^0-9.,\-]/g, '').replace(',', '.');
	const value = parseFloat(cleaned);
	if (isNaN(value)) return 0;
	return Math.round(value * 100);
}

/**
 * Convert an amount in cents from one currency to another using an exchange rate.
 * Rate is expressed as "1 foreign currency = rate * home currency"
 */
export function convertToHomeCurrency(amountCents: number, exchangeRate: string): number {
	const rate = parseFloat(exchangeRate);
	if (isNaN(rate) || rate <= 0) return amountCents;
	return Math.round(amountCents * rate);
}

/**
 * Common currency codes for the selector
 */
export const COMMON_CURRENCIES = [
	'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK',
	'PLN', 'CZK', 'HUF', 'HRK', 'RON', 'BGN', 'TRY', 'THB', 'MXN', 'BRL',
	'CNY', 'KRW', 'INR', 'NZD', 'ZAR', 'MAD', 'ISK'
];
