import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

/**
 * Check if SMTP email is configured via environment variables.
 */
export function isEmailConfigured(): boolean {
	return !!process.env.SMTP_HOST;
}

/**
 * Get or create the nodemailer transport (lazy singleton).
 */
function getTransporter(): Transporter {
	if (!transporter) {
		transporter = nodemailer.createTransport({
			host: process.env.SMTP_HOST,
			port: parseInt(process.env.SMTP_PORT || '587', 10),
			secure: process.env.SMTP_PORT === '465',
			auth:
				process.env.SMTP_USER
					? {
							user: process.env.SMTP_USER,
							pass: process.env.SMTP_PASS || ''
						}
					: undefined
		});
	}
	return transporter;
}

/**
 * Send an email. Best-effort: logs errors but does not throw.
 */
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
	try {
		const transport = getTransporter();
		await transport.sendMail({
			from: process.env.SMTP_FROM || '42 <noreply@localhost>',
			to,
			subject,
			html
		});
	} catch (err) {
		console.error('[email] Failed to send:', err);
	}
}

/**
 * Send a welcome email to a newly created user.
 */
export async function sendWelcomeEmail(
	toEmail: string,
	toName: string,
	appUrl: string
): Promise<void> {
	if (!toEmail) return;

	const subject = 'Welcome to 42';
	const html = buildWelcomeEmailHtml(toName, appUrl);
	await sendEmail(toEmail, subject, html);
}

/**
 * Send a trip invitation email when a user is linked to a trip as a member.
 */
export async function sendTripInvitationEmail(
	toEmail: string,
	toName: string,
	inviterName: string,
	tripName: string,
	tripDestination: string | null,
	appUrl: string
): Promise<void> {
	if (!toEmail) return;

	const subject = `${inviterName} added you to a trip`;
	const html = buildTripInvitationEmailHtml(toName, inviterName, tripName, tripDestination, appUrl);
	await sendEmail(toEmail, subject, html);
}

/**
 * Send a password reset notification to a user (triggered by admin reset).
 */
export async function sendPasswordResetEmail(
	toEmail: string,
	toName: string,
	appUrl: string
): Promise<void> {
	if (!toEmail) return;

	const subject = 'Your 42 password has been reset';
	const html = buildPasswordResetEmailHtml(toName, appUrl);
	await sendEmail(toEmail, subject, html);
}

/**
 * Send a role change notification to a user.
 */
export async function sendRoleChangedEmail(
	toEmail: string,
	toName: string,
	newRole: 'admin' | 'user',
	appUrl: string
): Promise<void> {
	if (!toEmail) return;

	const subject = 'Your 42 account role has been updated';
	const html = buildRoleChangedEmailHtml(toName, newRole, appUrl);
	await sendEmail(toEmail, subject, html);
}

// ── HTML builders ────────────────────────────────────────────────────

function buildEmailLayout(content: string, footer: string): string {
	return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f0e6d3;font-family:'JetBrains Mono',monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0e6d3;padding:40px 20px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background-color:#faf5eb;border:1px solid #d4cabb;box-shadow:2px 2px 0px #d4cabb;">
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:11px;color:#C8860A;text-transform:uppercase;letter-spacing:2px;">42</p>
          ${content}
          <p style="margin:0;font-size:11px;color:#6b6272;line-height:1.5;">${footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildOpenButton(appUrl: string, label = 'Open 42'): string {
	return `<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background-color:#C8860A;box-shadow:2px 2px 0px #1a1a2e;">
              <a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:10px 24px;color:#faf5eb;font-size:13px;font-weight:bold;text-decoration:none;font-family:'JetBrains Mono',monospace;">${escapeHtml(label)}</a>
            </td></tr>
          </table>`;
}

function buildWelcomeEmailHtml(toName: string, appUrl: string): string {
	const displayName = escapeHtml(toName || 'there');
	const content = `<h1 style="margin:0 0 24px;font-size:18px;color:#1a1a2e;font-weight:bold;">Welcome to 42</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#1a1a2e;line-height:1.6;">
            Hey ${displayName},
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#1a1a2e;line-height:1.6;">
            An admin has created an account for you on 42. You can log in and start tracking your trip budgets right away.
          </p>
          ${buildOpenButton(appUrl)}`;
	return buildEmailLayout(content, 'You&rsquo;re receiving this because an admin created an account for you on 42.');
}

function buildTripInvitationEmailHtml(
	toName: string,
	inviterName: string,
	tripName: string,
	tripDestination: string | null,
	appUrl: string
): string {
	const displayName = escapeHtml(toName || 'there');
	const escapedInviter = escapeHtml(inviterName || 'Someone');
	const escapedTrip = escapeHtml(tripName);
	const destinationLine = tripDestination
		? ` to <strong>${escapeHtml(tripDestination)}</strong>`
		: '';
	const content = `<h1 style="margin:0 0 24px;font-size:18px;color:#1a1a2e;font-weight:bold;">You&rsquo;ve been added to a trip</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#1a1a2e;line-height:1.6;">
            Hey ${displayName},
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#1a1a2e;line-height:1.6;">
            <strong>${escapedInviter}</strong> added you to the trip <strong>&ldquo;${escapedTrip}&rdquo;</strong>${destinationLine}. You can now view expenses and add your own.
          </p>
          ${buildOpenButton(appUrl)}`;
	return buildEmailLayout(content, 'You&rsquo;re receiving this because someone added you to a trip on 42.');
}

function buildPasswordResetEmailHtml(toName: string, appUrl: string): string {
	const displayName = escapeHtml(toName || 'there');
	const content = `<h1 style="margin:0 0 24px;font-size:18px;color:#1a1a2e;font-weight:bold;">Password reset</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#1a1a2e;line-height:1.6;">
            Hey ${displayName},
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#1a1a2e;line-height:1.6;">
            An admin has reset your 42 password. Please log in and change it to something only you know.
          </p>
          ${buildOpenButton(appUrl)}`;
	return buildEmailLayout(content, 'You&rsquo;re receiving this because an admin reset your password on 42. If you didn&rsquo;t expect this, please contact your admin.');
}

function buildRoleChangedEmailHtml(toName: string, newRole: 'admin' | 'user', appUrl: string): string {
	const displayName = escapeHtml(toName || 'there');
	const roleLabel = newRole === 'admin' ? 'Admin' : 'User';
	const detail = newRole === 'admin'
		? 'You now have admin privileges, including the ability to manage users and settings.'
		: 'Your account no longer has admin privileges.';
	const content = `<h1 style="margin:0 0 24px;font-size:18px;color:#1a1a2e;font-weight:bold;">Role updated: ${roleLabel}</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#1a1a2e;line-height:1.6;">
            Hey ${displayName},
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#1a1a2e;line-height:1.6;">
            Your 42 account role has been updated to <strong>${escapeHtml(roleLabel)}</strong>. ${escapeHtml(detail)}
          </p>
          ${buildOpenButton(appUrl)}`;
	return buildEmailLayout(content, 'You&rsquo;re receiving this because your account role was changed on 42.');
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
