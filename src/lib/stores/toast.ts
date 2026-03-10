import { writable } from 'svelte/store';

export interface ToastMessage {
	id: number;
	text: string;
	type: 'info' | 'success' | 'error';
	action?: { label: string; handler: () => void };
}

let counter = 0;
export const toasts = writable<ToastMessage[]>([]);

export function showToast(
	text: string,
	type: 'info' | 'success' | 'error' = 'info',
	action?: { label: string; handler: () => void },
	duration = 4000
) {
	const id = ++counter;
	toasts.update((t) => [...t, { id, text, type, action }]);
	if (!action) {
		setTimeout(() => dismiss(id), duration);
	}
}

export function dismiss(id: number) {
	toasts.update((t) => t.filter((toast) => toast.id !== id));
}
