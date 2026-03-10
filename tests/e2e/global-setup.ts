import { existsSync, unlinkSync } from 'fs';

const TEST_DB = './data/test-42.db';

export default function globalSetup() {
	// Clean test database before E2E run so each run starts fresh
	for (const ext of ['', '-journal', '-wal', '-shm']) {
		const path = `${TEST_DB}${ext}`;
		if (existsSync(path)) {
			unlinkSync(path);
		}
	}
}
