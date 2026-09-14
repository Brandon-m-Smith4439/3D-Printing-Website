import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Privacy information for custom 3D print requests.",
};

export default function PrivacyPage() {
  return (
    <section className="section page-hero">
      <div className="container policy-page">
        <p className="eyebrow">PRIVACY</p>
        <h1>Privacy policy</h1>
        <p className="lead">This starter policy describes how the website is designed to handle information submitted through the custom request form. Replace the bracketed business details before launch and have the final policy reviewed if your legal requirements warrant it.</p>

        <h2>Information collected</h2>
        <p>The custom request form may collect your name, email address, optional phone number, project requirements, reference links, and other information you choose to provide about a requested 3D print.</p>

        <h2>How information is used</h2>
        <p>Submitted information is used to review the project, communicate about feasibility and pricing, prepare a quote, and coordinate work that you choose to approve.</p>

        <h2>Payments and storefronts</h2>
        <p>This website does not process payment-card information. Purchases made through Etsy or Whatnot are handled by those platforms and are subject to their own privacy and payment practices.</p>

        <h2>Spam and abuse protection</h2>
        <p>The request form may use Cloudflare Turnstile and hosting-provider security controls to detect automated abuse and protect the website.</p>

        <h2>Data sharing</h2>
        <p>Request information is not intended to be sold. It may be processed by service providers needed to operate the website and deliver request notifications, such as the hosting and email-delivery providers.</p>

        <h2>Contact</h2>
        <p>Before launch, add your business contact email here so visitors can ask privacy-related questions or request deletion of information you still retain.</p>
      </div>
    </section>
  );
}
