<script lang="ts">
	import type { CategoryId } from '$lib/types/index.js';
	import { CATEGORY_MAP } from '$lib/types/categories.js';
	import Utensils from 'lucide-svelte/icons/utensils';
	import Bed from 'lucide-svelte/icons/bed';
	import Car from 'lucide-svelte/icons/car';
	import Ticket from 'lucide-svelte/icons/ticket';
	import ShoppingBag from 'lucide-svelte/icons/shopping-bag';
	import Ellipsis from 'lucide-svelte/icons/ellipsis';

	interface Props {
		categoryId: CategoryId;
		size?: number;
	}

	let { categoryId, size = 18 }: Props = $props();

	const iconMap = {
		food: Utensils,
		accommodation: Bed,
		transport: Car,
		activities: Ticket,
		shopping: ShoppingBag,
		misc: Ellipsis
	} as const;

	const color = $derived(CATEGORY_MAP.get(categoryId)?.color ?? '#95a5a6');
	const Icon = $derived(iconMap[categoryId] ?? Ellipsis);
</script>

<span class="inline-flex items-center justify-center" style="color: {color}">
	<Icon {size} />
</span>
