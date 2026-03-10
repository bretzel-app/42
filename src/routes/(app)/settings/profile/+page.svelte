<script lang="ts">
	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let displayName = $state(data.user?.displayName || '');
	// svelte-ignore state_referenced_locally
	let email = $state(data.user?.email || '');
	let profileMsg = $state('');
	let profileError = $state(false);

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmNewPassword = $state('');
	let passwordMsg = $state('');
	let passwordError = $state(false);

	async function handleLogout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		window.location.href = '/login';
	}

	async function saveProfile() {
		profileMsg = '';
		try {
			const res = await fetch('/api/auth/profile', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ displayName, email })
			});
			if (res.ok) {
				profileMsg = 'Profile updated';
				profileError = false;
			} else {
				const d = await res.json();
				profileMsg = d.message || 'Failed to update';
				profileError = true;
			}
		} catch {
			profileMsg = 'Connection error';
			profileError = true;
		}
	}

	async function changePassword() {
		passwordMsg = '';
		if (newPassword.length < 8) {
			passwordMsg = 'Password must be at least 8 characters';
			passwordError = true;
			return;
		}
		if (newPassword !== confirmNewPassword) {
			passwordMsg = 'Passwords do not match';
			passwordError = true;
			return;
		}
		try {
			const res = await fetch('/api/auth/password', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ currentPassword, newPassword })
			});
			if (res.ok) {
				passwordMsg = 'Password changed';
				passwordError = false;
				currentPassword = '';
				newPassword = '';
				confirmNewPassword = '';
			} else {
				const d = await res.json();
				passwordMsg = d.message || 'Failed to change password';
				passwordError = true;
			}
		} catch {
			passwordMsg = 'Connection error';
			passwordError = true;
		}
	}
</script>

<!-- Profile -->
<section class="mb-6 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-[var(--card-shadow)]">
	<h2 class="mb-4 text-lg font-semibold text-[var(--text)]">Profile</h2>
	{#if profileMsg}
		<div class="mb-4 rounded-sm border p-3 text-sm {profileError ? 'border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error-text)]' : 'border-[var(--success-bg)] bg-[var(--success-bg)] text-[var(--success-text)]'}">{profileMsg}</div>
	{/if}
	<div class="space-y-4">
		<div>
			<label for="display-name" class="mb-1 block text-sm font-medium text-[var(--text)]">Display Name</label>
			<input id="display-name" type="text" bind:value={displayName} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]" />
		</div>
		<div>
			<label for="email" class="mb-1 block text-sm font-medium text-[var(--text)]">Email</label>
			<input id="email" type="email" bind:value={email} class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]" />
		</div>
		<button onclick={saveProfile} class="rounded-sm bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]">Save profile</button>
	</div>
</section>

<!-- Change Password -->
<section class="mb-6 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-[var(--card-shadow)]">
	<h2 class="mb-4 text-lg font-semibold text-[var(--text)]">Change Password</h2>
	{#if passwordMsg}
		<div class="mb-4 rounded-sm border p-3 text-sm {passwordError ? 'border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error-text)]' : 'border-[var(--success-bg)] bg-[var(--success-bg)] text-[var(--success-text)]'}">{passwordMsg}</div>
	{/if}
	<div class="space-y-4">
		<input type="password" bind:value={currentPassword} placeholder="Current password" class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]" />
		<input type="password" bind:value={newPassword} placeholder="New password (min 8 characters)" class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]" />
		<input type="password" bind:value={confirmNewPassword} placeholder="Confirm new password" class="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]" />
		<button onclick={changePassword} class="rounded-sm bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]">Change password</button>
	</div>
</section>

<!-- Log Out -->
<section class="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-[var(--card-shadow)]">
	<button
		onclick={handleLogout}
		class="rounded-sm border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
		data-testid="logout-btn"
	>
		Log out
	</button>
</section>
