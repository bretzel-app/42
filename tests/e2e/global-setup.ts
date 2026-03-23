import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

const TEST_DB = './data/test-42.db';
export const TEST_CREDENTIALS_FILE = './data/test-credentials.json';

export default function globalSetup() {
	// Clean test database before E2E run so each run starts fresh
	for (const ext of ['', '-journal', '-wal', '-shm']) {
		const path = `${TEST_DB}${ext}`;
		if (existsSync(path)) {
			unlinkSync(path);
		}
	}

	// Generate random passwords for this test run, shared across all workers
	writeFileSync(
		TEST_CREDENTIALS_FILE,
		JSON.stringify({
			testPassword: `test-${randomUUID()}`,
			userPassword: `user-${randomUUID()}`
		})
	);
}
