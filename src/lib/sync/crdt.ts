/**
 * Generic Last-Write-Wins (LWW) merge for entities with updatedAt + version.
 */
export function mergeEntity<T extends { updatedAt: Date; version: number }>(
	local: T,
	remote: T
): T {
	const localTime = new Date(local.updatedAt).getTime();
	const remoteTime = new Date(remote.updatedAt).getTime();

	if (remoteTime > localTime) return { ...remote };
	if (localTime > remoteTime) return { ...local };

	// Same timestamp — prefer higher version number
	if (remote.version > local.version) return { ...remote };
	return { ...local };
}
