import type { CategoryId } from './index.js';

export interface Category {
	id: CategoryId;
	label: string;
	icon: string; // lucide icon name
	color: string; // CSS color for charts
}

export const CATEGORIES: Category[] = [
	{ id: 'food', label: 'Food & Drinks', icon: 'utensils', color: '#e67e22' },
	{ id: 'accommodation', label: 'Accommodation', icon: 'bed', color: '#3498db' },
	{ id: 'transport', label: 'Transport', icon: 'car', color: '#2ecc71' },
	{ id: 'activities', label: 'Activities', icon: 'ticket', color: '#9b59b6' },
	{ id: 'shopping', label: 'Shopping', icon: 'shopping-bag', color: '#e74c3c' },
	{ id: 'misc', label: 'Misc', icon: 'ellipsis', color: '#95a5a6' }
];

export const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategoryLabel(id: CategoryId): string {
	return CATEGORY_MAP.get(id)?.label ?? id;
}

export function getCategoryColor(id: CategoryId): string {
	return CATEGORY_MAP.get(id)?.color ?? '#95a5a6';
}
