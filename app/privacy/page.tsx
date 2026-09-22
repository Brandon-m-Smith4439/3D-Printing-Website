import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Privacy information for customer profiles, attachments, and custom 3D print requests.",
};

export default function PrivacyPage() {
  return (
    <section className="section page-hero">
      <div className="container policy-page">
        <p className="eyebrow">PRIVACY</p>
        <h1>Privacy policy</h1>
        <p className="lead">This policy explains how Mesh Harbor 3D handles information submitted through customer profiles, custom-print requests, quotes, payments, shipping, and production updates.</p>

        <h2>Information collected</h2>
        <p>The custom request form may collect your name, email address, optional phone number, project requirements, requested timing, reference links, and files or images you deliberately attach to explain a requested 3D print.</p>

        <h2>Customer profiles and account security</h2>
        <p>If you create an optional customer profile, the site stores your display name, email address, a salted password hash, account preferences, profile-linked request identifiers, and status notifications needed to provide the account features. Passwords are not stored in plain text. Email-verification links use random, expiring tokens whose stored form is hashed.</p>

        <h2>Customer attachments</h2>
        <p>Customer attachments are stored outside the public website directory and are not intended to be directly addressable by a public URL. Owner access requires an authenticated owner session. Supported customer images are re-encoded in the browser to remove ordinary embedded image metadata before upload. Production deployments are designed to reject customer file uploads unless a configured malware scanner accepts the file. No malware scanner can guarantee that a file is harmless, so uploaded model files are treated as untrusted content and should never be executed as software.</p>

        <h2>How information is used</h2>
        <p>Submitted information is used to review the project, communicate about feasibility and pricing, prepare a quote, coordinate approved work, show request and production status to the authenticated customer, and provide service-related notifications.</p>

        <h2>Quotes, payments, and storefronts</h2>
        <p>Custom quotes, the exact terms accepted by a customer, approval timestamps, deposit status, and payment-provider reference identifiers may be stored as part of the business record. Payment-card details are entered on Stripe-hosted Checkout and are not collected or stored by this website. Purchases made through Etsy or Whatnot are handled by those platforms and are subject to their own privacy and payment practices.</p>

        <h2>Production queue</h2>
        <p>Accepted print jobs may appear on the public Queue page using a generated order code, a generic public print name, status, quantity, owner-selected image, and estimated date. Customer names, email addresses, private notes, account details, and customer-uploaded attachments are not displayed publicly.</p>

        <h2>Profile privacy</h2>
        <p>A profile is designed to show requests submitted while that customer account was signed in. The site does not automatically expose older requests merely because a newly created account uses the same email address.</p>

        <h2>Notifications</h2>
        <p>Profile-linked request and production status changes may appear as in-app notifications. Verified customers may choose to receive status emails. When an accepted print job is marked completed, the email address associated with that job may also be used to send a completion notification and coordinate pickup or shipping.</p>

        <h2>Spam and abuse protection</h2>
        <p>The request, upload, and authentication flows may use Cloudflare Turnstile, rate limiting, file validation, malware scanning, scam-pattern screening, and hosting-provider security controls to detect abuse and protect the website.</p>

        <h2>Storage, backups, and service providers</h2>
        <p>Request, account, quote, audit, and production records are stored in the private application database. Private customer attachments are kept outside the public website directory. Private backup snapshots may contain the application database and customer attachments and should be stored on access-controlled persistent storage with host or volume encryption enabled.</p>

        <h2>Data sharing</h2>
        <p>Request and profile information is not intended to be sold. It may be processed by service providers needed to operate the website and deliver its services, such as hosting, security, storage, authentication, malware-scanning, email-delivery, and payment providers. Stripe receives payment information when a customer chooses to pay a custom-order deposit through Stripe Checkout.</p>

        <h2>Contact</h2>
        <p>Before launch, add your business contact email here so visitors can ask privacy-related questions or request deletion of information you still retain.</p>
      </div>
    </section>
  );
}
