import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalTable } from '@/components/google/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What data Rankcall collects, how Google user data is used, who processes it, how long it is kept and your rights under UK GDPR.',
};

export default function Privacy() {
  return (
    <LegalPage current="/privacy" title="Privacy policy" sub="What we collect, why, who helps us process it, how long we keep it and how to have it deleted." updated="[Date of publication]">
      <h2>1. Who we are</h2>
      <p>Rankcall is operated by <b>[Company legal name]</b>, a company registered in [England and Wales] under number [Company number], whose registered office is at [Registered address]. We are the controller of the personal data described here. Our ICO registration number is [ICO registration number].</p>
      <p>Questions about this policy or your data: <b>[support email]</b>.</p>

      <h2>2. What we collect</h2>
      <h3>Account data</h3>
      <ul>
        <li>Your name, email address and company name when you sign up.</li>
        <li>Your password, stored only as a salted scrypt hash. We cannot read it.</li>
        <li>Your plan, trial dates and subscription status. Card details are collected and held by Stripe, not by us.</li>
      </ul>
      <h3>Site data you give us</h3>
      <ul>
        <li>Files you upload or paste: Search Console and GA4 exports, crawler exports, backlink exports, keyword lists and similar.</li>
        <li>Pages we crawl from the sitemap you point us at.</li>
        <li>The decisions, tasks, notes and outcomes created in the app.</li>
      </ul>
      <h3>Google user data (only if you connect Google)</h3>
      <p>If you choose to connect a Google account to a site, we request read-only access and receive:</p>
      <ul>
        <li><b>Your Google account email address</b> (scopes <code className="mono">openid</code> and <code className="mono">email</code>), shown in the app so you know which account is connected.</li>
        <li><b>The list of Search Console properties and Google Analytics 4 properties</b> you can access, so you can pick one of each for the site.</li>
        <li><b>Search Console performance data</b> for the property you choose (scope <code className="mono">webmasters.readonly</code>): page URLs, search queries, clicks, impressions, click-through rate and average position for the last 28 days and the 28 days before.</li>
        <li><b>GA4 landing page data</b> for the property you choose (scope <code className="mono">analytics.readonly</code>): sessions, engaged sessions, key events and total revenue by landing page for the last 28 days.</li>
        <li><b>An OAuth refresh token</b> that lets us fetch this data again when you press Sync or on a scheduled sync. It is stored encrypted (AES-256-GCM).</li>
      </ul>
      <p>We cannot change anything in your Search Console or Google Analytics accounts. All Google scopes we request are read-only.</p>
      <h3>Technical data</h3>
      <ul>
        <li>One strictly necessary session cookie that keeps you signed in. Your light or dark theme choice is saved in your own browser.</li>
        <li>Server logs (IP address, time, page requested, errors) used to run and secure the service.</li>
        <li>[Confirm: we use no advertising or third-party analytics cookies.]</li>
      </ul>

      <h2>3. How we use it</h2>
      <ul>
        <li>To provide the service: join your data by URL, score every page, explain each recommendation, create tasks and measure outcomes.</li>
        <li>To run your account and billing, and to send service emails (for example about your trial or a failed payment).</li>
        <li>To keep the service secure, prevent abuse and fix faults.</li>
        <li>To meet legal obligations, such as keeping accounting records.</li>
      </ul>
      <p>We do not sell personal data, and we do not use any of your data for advertising.</p>

      <h2>4. How we use Google user data</h2>
      <p><b>Rankcall&apos;s use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</b></p>
      <p>In particular:</p>
      <ul>
        <li>We use Google user data <b>only to provide and improve the user-facing features</b> of Rankcall that you can see in the app: page verdicts, cannibalisation checks, outcome measurement and the other modules that read your site data.</li>
        <li>We <b>do not transfer</b> Google user data to others except as necessary to provide or improve those features (see the sub-processors below), to comply with applicable law, or as part of a merger, acquisition or sale of assets with notice to you.</li>
        <li>We <b>do not use or transfer</b> Google user data for serving advertisements, including retargeting or personalised or interest-based advertising.</li>
        <li>We <b>do not sell</b> Google user data, and we do not use it to determine credit-worthiness or for lending.</li>
        <li><b>No person at Rankcall reads</b> your Google user data unless you give us permission for a specific support request, it is needed for security purposes (such as investigating abuse), it is needed to comply with the law, or it has been aggregated and anonymised for internal operations.</li>
        <li>We <b>do not use</b> Google user data to develop, improve or train generalised or non-personalised AI or machine-learning models.</li>
      </ul>
      <p>To make a decision about a page, Rankcall sends a small, structured description of that page to TypeSafe&apos;s decision model, Jev. It contains values derived from your data, such as the page path, its title, its top search queries and traffic trends expressed as bands (for example &ldquo;declining sharply&rdquo;). Jev returns a choice from a fixed list with a probability. [Confirm with TypeSafe in writing: inputs are processed only to return the decision, are not used for training, and the retention period.]</p>
      <p>You can disconnect Google at any time on the site&apos;s Data page. Disconnecting revokes our access at Google and deletes the stored tokens straight away. You can also remove access at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>

      <h2>5. Legal bases (UK GDPR)</h2>
      <ul>
        <li><b>Contract</b>: to provide the service you signed up for, including processing the site data you upload or sync.</li>
        <li><b>Consent</b>: connecting a Google account. You can withdraw it by disconnecting.</li>
        <li><b>Legitimate interests</b>: keeping the service secure and reliable, and improving it, in ways you would expect.</li>
        <li><b>Legal obligation</b>: tax and accounting records.</li>
      </ul>

      <h2>6. Who processes data for us</h2>
      <p>We use these sub-processors. Each processes data only on our instructions and under a data processing agreement.</p>
      <LegalTable
        head={['Sub-processor', 'Purpose', 'Data', 'Location']}
        rows={[
          ['TypeSafe [legal entity name]', 'Jev decisions for each page, keyword or item', 'Structured, banded descriptions of pages (paths, titles, queries, bands)', '[Location]'],
          ['Stripe Payments Europe, Ltd. [confirm entity]', 'Subscriptions and payments', 'Name, email, billing details, card data (held by Stripe)', '[EU / US]'],
          ['[Hosting provider]', 'Hosting the app and database', 'All service data', '[UK / EU region]'],
          ['[Backup provider]', 'Encrypted backups', 'All service data', '[UK / EU region]'],
          ['[Email provider, if used]', 'Service emails', 'Name, email address', '[Location]'],
        ]}
      />
      <p>Where a sub-processor is outside the UK, we rely on UK adequacy regulations or the International Data Transfer Agreement or Addendum. [Confirm per provider.]</p>

      <h2>7. How long we keep it</h2>
      <ul>
        <li><b>Google tokens</b>: until you disconnect Google, delete the site or close your account; then deleted immediately and revoked at Google.</li>
        <li><b>Synced and uploaded site data</b>: kept as upload history (so outcomes can compare periods) until you remove the upload, delete the site or close your account.</li>
        <li><b>Account data</b>: while your account is open. After cancellation, all account and site data is deleted within 30 days.</li>
        <li><b>Backups</b>: roll off within [number] days of deletion from the live system.</li>
        <li><b>Server logs</b>: [number] days.</li>
        <li><b>Billing records</b>: as long as the law requires (usually six years in the UK).</li>
      </ul>

      <h2>8. Security</h2>
      <p>Data is encrypted in transit (HTTPS). Google OAuth tokens are encrypted at rest with AES-256-GCM. Passwords are hashed with scrypt. Every page and API route checks that the signed-in account owns the site it asks for. See our <Link href="/security">security page</Link> for more.</p>

      <h2>9. Your rights</h2>
      <p>Under UK GDPR you can ask us to give you a copy of your personal data, correct it, delete it, restrict or object to its use, or send it to you or another provider in a portable format. Where we rely on consent you can withdraw it at any time. Email <b>[support email]</b>; we reply within one month.</p>
      <p>You can also complain to the Information Commissioner&apos;s Office at <a href="https://ico.org.uk/make-a-complaint/">ico.org.uk</a>. We would appreciate the chance to help first.</p>

      <h2>10. Children</h2>
      <p>Rankcall is a business tool and is not intended for anyone under 18.</p>

      <h2>11. Changes</h2>
      <p>If we change this policy in a way that matters, we will tell account owners by email before it takes effect. The date at the top shows the latest version.</p>

      <h2>12. Contact</h2>
      <p>[Company legal name], [Registered address]. Email <b>[support email]</b>.</p>
    </LegalPage>
  );
}
