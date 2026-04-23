import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, 'src/lib')
		}
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		// Server modules (api-keys, collaborators, …) import `./db/index.js` at
		// the top level, which opens the DATABASE_URL SQLite file as a side
		// effect. Point it at an in-memory DB so parallel test workers don't
		// race each other on the same file (seen as SQLITE_BUSY in CI).
		env: {
			DATABASE_URL: ':memory:'
		},
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov', 'json-summary'],
			reportsDirectory: './coverage/unit',
			include: ['src/lib/**/*.ts'],
			exclude: ['src/lib/**/*.test.ts', 'src/lib/types/**']
		}
	}
});
