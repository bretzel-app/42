import { browser } from '$app/environment';
import { DEFAULT_PREFERENCES, BOOLEAN_PREF_KEYS } from '$lib/types/preferences.js';
import type { UserPreferences } from '$lib/types/preferences.js';

const STORAGE_KEY = '42-preferences';

let preferences = $state<UserPreferences>({ ...DEFAULT_PREFERENCES });

function loadFromLocalStorage(): UserPreferences {
	if (!browser) return { ...DEFAULT_PREFERENCES };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return { ...DEFAULT_PREFERENCES, ...parsed };
		}
	} catch {
		// Corrupted localStorage — use defaults
	}
	return { ...DEFAULT_PREFERENCES };
}

function saveToLocalStorage(prefs: UserPreferences) {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
	} catch {
		// localStorage full or unavailable
	}
}

/** Convert server key-value record to typed UserPreferences */
function fromServerRecord(record: Record<string, string>): Partial<UserPreferences> {
	const result: Partial<UserPreferences> = {};
	for (const [key, value] of Object.entries(record)) {
		if (key in DEFAULT_PREFERENCES) {
			const k = key as keyof UserPreferences;
			if (BOOLEAN_PREF_KEYS.has(k)) {
				(result as Record<string, unknown>)[k] = value === 'true';
			} else {
				(result as Record<string, unknown>)[k] = value;
			}
		}
	}
	return result;
}

/** Convert UserPreferences to server key-value record */
function toServerRecord(prefs: Partial<UserPreferences>): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(prefs)) {
		result[key] = String(value);
	}
	return result;
}

export function initPreferences() {
	preferences = loadFromLocalStorage();
	syncPreferencesFromServer();
}

export function getPreferences(): UserPreferences {
	return preferences;
}

export function updatePreference<K extends keyof UserPreferences>(
	key: K,
	value: UserPreferences[K]
) {
	preferences = { ...preferences, [key]: value };
	saveToLocalStorage(preferences);
	pushToServer({ [key]: value });
}

export async function syncPreferencesFromServer() {
	if (!browser) return;
	try {
		const res = await fetch('/api/preferences');
		if (res.ok) {
			const serverPrefs: Record<string, string> = await res.json();
			const parsed = fromServerRecord(serverPrefs);
			preferences = { ...DEFAULT_PREFERENCES, ...parsed };
			saveToLocalStorage(preferences);
		}
	} catch {
		// Offline — local state stands
	}
}

async function pushToServer(partial: Partial<UserPreferences>) {
	if (!browser) return;
	try {
		await fetch('/api/preferences', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(toServerRecord(partial))
		});
	} catch {
		// Offline — localStorage already updated
	}
}
