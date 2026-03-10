import { describe, it, expect } from 'vitest';
import { mergeEntity } from './crdt.js';

interface TestEntity {
	id: string;
	name: string;
	updatedAt: Date;
	version: number;
}

describe('mergeEntity', () => {
	it('picks remote when remote is newer', () => {
		const local: TestEntity = { id: '1', name: 'local', updatedAt: new Date('2025-01-01'), version: 1 };
		const remote: TestEntity = { id: '1', name: 'remote', updatedAt: new Date('2025-01-02'), version: 1 };
		expect(mergeEntity(local, remote).name).toBe('remote');
	});

	it('picks local when local is newer', () => {
		const local: TestEntity = { id: '1', name: 'local', updatedAt: new Date('2025-01-02'), version: 1 };
		const remote: TestEntity = { id: '1', name: 'remote', updatedAt: new Date('2025-01-01'), version: 1 };
		expect(mergeEntity(local, remote).name).toBe('local');
	});

	it('uses version as tiebreaker when timestamps are equal', () => {
		const local: TestEntity = { id: '1', name: 'local', updatedAt: new Date('2025-01-01'), version: 1 };
		const remote: TestEntity = { id: '1', name: 'remote', updatedAt: new Date('2025-01-01'), version: 2 };
		expect(mergeEntity(local, remote).name).toBe('remote');
	});

	it('picks local when timestamps and versions are equal', () => {
		const local: TestEntity = { id: '1', name: 'local', updatedAt: new Date('2025-01-01'), version: 1 };
		const remote: TestEntity = { id: '1', name: 'remote', updatedAt: new Date('2025-01-01'), version: 1 };
		expect(mergeEntity(local, remote).name).toBe('local');
	});
});
