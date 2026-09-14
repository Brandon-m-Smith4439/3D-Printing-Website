# LayerCraft 3D — Website Starter

A security-conscious storefront/showcase for a small 3D printing business.

## Included in V1

- Responsive dark, sleek home page
- Project gallery
- Etsy and Whatnot outbound shop links
- Custom print request page
- Server-side validation with Zod
- Cloudflare Turnstile bot protection with server-side verification
- Honeypot field and request-size checks
- Origin checking for the request endpoint
- Basic per-IP application rate limiting
- Resend email delivery for custom requests
- Security headers including CSP, clickjacking protection, MIME sniffing protection, referrer policy, and permissions policy
- Privacy page starter
- No user accounts, passwords, payment details, or public writeable database
- No direct customer file uploads in V1

## Why the architecture is intentionally small

The safest feature is one you do not expose. Purchases stay on Etsy/Whatnot, so this website does not need to process cards or store order/payment data. Custom requests are validated and emailed to you instead of creating a public customer database.

## Local setup

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Fill in your Etsy/Whatnot links.
5. Create a Cloudflare Turnstile widget and add its site key and secret.
6. Create a Resend account/domain and add the API key plus destination/sender addresses.
7. Run `npm run dev`.
8. Open `http://localhost:3000`.

When Turnstile and Resend secrets are absent, local development can still load. Production intentionally rejects form delivery if the required security/delivery configuration is missing.

## Add your own gallery images

The starter gallery data is in `lib/site.ts` and the image assets are under `public/`.

A simple first workflow is:

1. Put optimized WebP/AVIF/JPG images in `public/prints/`.
2. Add or edit an entry in `galleryItems` inside `lib/site.ts`.
3. Set `image` to a path such as `/prints/bullseye.webp`.
4. Update the title, category, and description.

For a later revision, use a hosted CMS or protected admin workflow so you can add gallery projects without editing source code. Keeping the public site read-only remains preferable.

## Recommended production deployment

Vercel is the easiest fit for this starter. Use:

- HTTPS only
- A custom domain
- Production environment variables stored in the host, never committed to Git
- Cloudflare Turnstile with production hostname restrictions
- Hosting-provider firewall/rate-limiting rules on `/api/custom-request`
- Dependency/security update alerts
- Separate development and production Turnstile keys

The included in-memory limiter is only a second layer. Serverless instances do not share memory. Configure rate limiting at the hosting/firewall layer for real production enforcement.

## Custom request security model

The request endpoint currently uses:

1. Same-origin checking in production
2. `application/json` enforcement
3. Request-size restriction
4. Basic IP throttling
5. Strict field schema and maximum lengths
6. Honeypot bot field
7. Cloudflare Turnstile server-side token validation
8. Turnstile action/hostname checks
9. HTML escaping before email rendering
10. Generic client errors so internal details are not leaked

## File uploads

Direct uploads are deliberately disabled in V1. Reference links are safer for the initial launch.

If direct uploads are added later, do not send arbitrary files through the main app server. Use signed one-time uploads to dedicated object storage with strict size/type allowlists, randomized object names, access controls, and malware scanning before anything is opened or processed.

## Before launch

- Replace `LayerCraft 3D` with the final business name.
- Add the real Etsy and Whatnot URLs.
- Replace starter gallery art with real print photos.
- Finish the privacy policy with real business contact information.
- Add your domain to `NEXT_PUBLIC_SITE_URL`.
- Configure Turnstile and Resend.
- Add firewall/rate-limit rules at the host/CDN layer.
- Test the form from desktop and mobile.
- Run `npm audit` and keep Next.js/React patched.
- Verify security headers using a reputable header scanner after deployment.

## Important note

The included controls materially reduce risk, but no public website can be made impossible to attack. Security depends on keeping dependencies patched, protecting secrets, restricting infrastructure access, monitoring abuse, and using the hosting provider's firewall/rate-limiting features in addition to application controls.
