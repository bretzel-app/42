import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import istanbul from 'vite-plugin-istanbul';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		chunkSizeWarningLimit: 850
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		...(process.env.VITE_COVERAGE === 'true'
			? [
					istanbul({
						include: 'src/**/*',
						exclude: ['node_modules', 'tests/', '**/*.test.ts'],
						extension: ['.ts', '.svelte'],
						requireEnv: true,
						forceBuildInstrument: true
					})
				]
			: []),
		SvelteKitPWA({
			scope: '/',
			buildBase: '/',
			registerType: 'autoUpdate',
			manifest: {
				name: '42 by Bretzel',
				short_name: '42',
				description: 'A self-hostable, offline-first holiday budget tracking app by Bretzel',
				start_url: '/',
				display: 'standalone',
				background_color: '#f0e6d3',
				theme_color: '#C8860A',
				icons: [
					{ src: 'web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png' }
				]
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
				navigateFallback: '/',
				runtimeCaching: [
					{
						urlPattern: ({ request }) => request.mode === 'navigate',
						handler: 'NetworkFirst',
						options: {
							cacheName: 'pages-cache',
							networkTimeoutSeconds: 3,
							expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 }
						}
					},
					{
						urlPattern: ({ request, url }) =>
							request.method === 'GET' && /\/api\//.test(url.pathname),
						handler: 'NetworkFirst',
						options: {
							cacheName: 'api-cache',
							networkTimeoutSeconds: 3,
							expiration: { maxEntries: 50, maxAgeSeconds: 300 }
						}
					},
					{
						urlPattern: /^https?:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'google-fonts-cache',
							expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }
						}
					}
				]
			}
		})
	]
});
