import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/google/LegalPage';

export const metadata: Metadata = {
  title: 'Security',
  description: 'How Rankcall protects your account, your site data and your Google connection.',
};

export default function Security() {
  return (
    <LegalPage current="/security" title="Security" sub="How we protect your account, your site data and your Google connection." updated="[Date of publication]">
      <h2>Google access</h2>
      <ul>
        <li>We ask only for read-only Google scopes: Search Console (<code className="mono">webmasters.readonly</code>) and Analytics (<code className="mono">analytics.readonly</code>), plus your email address so you can see which account is connected.</li>
        <li>Sign-in uses the OAuth 2.0 authorisation code flow with PKCE and a signed, expiring, single-use state tied to your session and site.</li>
        <li>Refresh and access tokens are encrypted at rest with AES-256-GCM using a key held outside the database. Without that key the server refuses to store or read them.</li>
        <li>Disconnecting revokes our access at Google and deletes the tokens immediately.</li>
      </ul>

      <h2>Accounts and access</h2>
      <ul>
        <li>Passwords are hashed with scrypt and a unique salt; we never store them in plain text.</li>
        <li>Sessions use a random token in an HTTP-only cookie; only a hash of it is stored.</li>
        <li>Every page, action and API route checks that your account owns the site it touches. Other accounts get a &ldquo;not found&rdquo;.</li>
        <li>All traffic is encrypted with HTTPS.</li>
      </ul>

      <h2>Your data</h2>
      <ul>
        <li>Data is hosted with [Hosting provider] in [UK / EU region], with encrypted backups kept for [number] days.</li>
        <li>We do not sell data or use it for advertising. See the <Link href="/privacy">privacy policy</Link> for sub-processors and retention.</li>
      </ul>

      <h2>Reporting a vulnerability</h2>
      <p>If you think you have found a security issue, email <b>[security email]</b> with the details. Please give us reasonable time to fix it before disclosing it, and do not access other customers&apos; data. We will acknowledge your report within [number] working days.</p>
    </LegalPage>
  );
}
