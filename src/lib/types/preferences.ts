export interface UserPreferences {
	defaultCurrency: string;
	hideFooter: boolean;
	sidebarDefaultState: 'open' | 'collapsed';
}

export const DEFAULT_PREFERENCES: UserPreferences = {
	defaultCurrency: 'EUR',
	hideFooter: false,
	sidebarDefaultState: 'open'
};

export const BOOLEAN_PREF_KEYS: ReadonlySet<keyof UserPreferences> = new Set([
	'hideFooter'
]);
