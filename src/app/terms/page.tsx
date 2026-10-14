import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/google/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms for using Rankcall: accounts, trials and billing, your data, Google connections, acceptable use and liability.',
};

export default function Terms() {
  return (
    <LegalPage current="/terms" title="Terms of service" sub="The agreement between you and us when you use Rankcall." updated="[Date of publication]">
      <h2>1. About these terms</h2>
      <p>These terms are between <b>[Company legal name]</b> (&ldquo;we&rdquo;, &ldquo;us&rdquo;), registered in [England and Wales] under number [Company number] at [Registered address], and the business or person that creates a Rankcall account (&ldquo;you&rdquo;). By creating an account you accept them. If you accept on behalf of a company, you confirm you have authority to do so.</p>
      <p>Rankcall is a business service. It is not offered to consumers.</p>

      <h2>2. The service</h2>
      <p>Rankcall analyses data about your websites (uploads, crawls and, if you connect them, Google Search Console and Google Analytics 4) and recommends what to do with each page, keyword or item, with a confidence score. Recommendations are produced by decision models and rules and are <b>advice only</b>. You decide whether to act on them, and you make any change to your site yourself. We do not guarantee any ranking, traffic or revenue result.</p>

      <h2>3. Accounts</h2>
      <ul>
        <li>Keep your sign-in details secure and tell us at once at <b>[support email]</b> if you think someone else has used your account.</li>
        <li>You are responsible for activity under your account and for the people you give access to.</li>
        <li>Only add sites you own or are authorised to analyse.</li>
      </ul>

      <h2>4. Trial, plans and payment</h2>
      <ul>
        <li>New accounts get a 14-day free trial with the limits shown on the pricing page. No card is needed to start.</li>
        <li>Paid plans are billed in advance, monthly or as shown at checkout, through Stripe. Prices exclude VAT unless stated.</li>
        <li>You can cancel at any time from the billing page; the plan stays active until the end of the period you have paid for. [Confirm refund policy.]</li>
        <li>We may change prices with at least [30] days&apos; notice by email. Changes apply from your next billing period.</li>
      </ul>

      <h2>5. Your data</h2>
      <ul>
        <li>You keep all rights in the data you upload or connect (&ldquo;your data&rdquo;). You give us permission to process it only to provide the service to you.</li>
        <li>You confirm you have the right to give us your data, including any personal data in it.</li>
        <li>Where your data contains personal data, we process it as your processor under our data processing agreement [link to DPA], and as controller for your account data as described in our <Link href="/privacy">privacy policy</Link>.</li>
        <li>You can export or delete your data at any time. After you cancel, we delete it within 30 days.</li>
      </ul>

      <h2>6. Google connections</h2>
      <ul>
        <li>Connecting Google is optional; uploads always remain available.</li>
        <li>We request read-only access to Search Console and Google Analytics and use the data only as described in our <Link href="/privacy">privacy policy</Link>, in line with the Google API Services User Data Policy, including its Limited Use requirements.</li>
        <li>You must be authorised to grant access to the properties you connect. You can disconnect at any time, which revokes our access.</li>
        <li>Google&apos;s services are provided by Google under Google&apos;s own terms. We are not responsible for their availability or accuracy.</li>
      </ul>

      <h2>7. Acceptable use</h2>
      <p>You must not:</p>
      <ul>
        <li>use the service to analyse sites you are not authorised to analyse, or to crawl sites in breach of their terms or at a rate that harms them;</li>
        <li>try to access other customers&apos; data, probe or break our security, or reverse engineer the service;</li>
        <li>resell or provide the service to third parties except as your plan allows (for example agency client reports);</li>
        <li>upload anything unlawful, or malware.</li>
      </ul>
      <p>We may suspend accounts that break these rules, with notice where reasonable.</p>

      <h2>8. Availability and changes</h2>
      <p>We aim to keep Rankcall available and to fix faults promptly, but do not promise it will be uninterrupted. We may change or improve features; if we remove a core feature of your paid plan, you may cancel and receive a pro-rata refund for the unused period.</p>

      <h2>9. Intellectual property</h2>
      <p>We own the service, its software and its design. You own your data and the outputs created for you (verdicts, briefs, reports, exports), which you may use freely in your business.</p>

      <h2>10. Liability</h2>
      <p>Nothing in these terms limits liability that cannot be limited by law, including for death or personal injury caused by negligence, or fraud. Subject to that:</p>
      <ul>
        <li>we are not liable for loss of profits, revenue, rankings, traffic, business or goodwill, or for indirect or consequential loss;</li>
        <li>our total liability in any 12-month period is limited to [the fees you paid us in that period] [lawyer to confirm].</li>
      </ul>

      <h2>11. Ending the agreement</h2>
      <p>You may close your account at any time. We may end these terms with [30] days&apos; notice, or straight away if you materially break them. On closure we delete your data within 30 days, and you can export it before then.</p>

      <h2>12. General</h2>
      <ul>
        <li>We may update these terms. We will email account owners about material changes at least [30] days before they apply.</li>
        <li>These terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.</li>
        <li>If any part of these terms is found unenforceable, the rest stays in force.</li>
      </ul>

      <h2>13. Contact</h2>
      <p>[Company legal name], [Registered address]. Email <b>[support email]</b>.</p>
    </LegalPage>
  );
}
