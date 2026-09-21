# Mesh Harbor 3D — Railway production deployment

V0.74 is prepared for a **single Railway service with one persistent Volume**. This matches the current SQLite + private-file architecture. Do not deploy this build to a stateless/serverless host without moving the database and private files first.

## 1. Create the Railway service

1. Put this project in a private GitHub repository, or use the Railway app/plugin to create/deploy the service.
2. Create a Railway service from the repository.
3. Use Node.js 22.5+ (the `package.json` engines field already requests this).
4. Railway can use the normal commands:
   - Build: `npm run build`
   - Start: `npm start`
5. Configure the Railway health check path as:

```text
/api/health
```

## 2. Add a persistent Volume — required

Attach one Railway Volume to this service and mount it at:

```text
/data
```

V0.74 automatically detects `RAILWAY_VOLUME_MOUNT_PATH` and stores the following on that persistent Volume:

- SQLite database: `/data/3d-printing-business.sqlite`
- Private customer files: `/data/private/`
- Backups: `/data/backups/`

Do not launch the business site without a persistent Volume. Without one, customer/order data can be lost on redeploy.

## 3. Required production secrets

Add these as Railway service variables. Never commit the real values to Git.

```env
NEXT_PUBLIC_SITE_URL=https://YOUR-RAILWAY-OR-CUSTOM-DOMAIN

OWNER_PASSWORD=USE-A-STRONG-UNIQUE-PASSWORD
OWNER_SESSION_SECRET=GENERATE-A-LONG-RANDOM-SECRET
CUSTOMER_SESSION_SECRET=GENERATE-A-DIFFERENT-LONG-RANDOM-SECRET
AUDIT_IP_SALT=GENERATE-ANOTHER-LONG-RANDOM-SECRET

NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

RESEND_API_KEY=
REQUEST_TO_EMAIL=
REQUEST_FROM_EMAIL=

EASYPOST_API_KEY=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

You can publish the site before Stripe is configured. Deposit Checkout remains unavailable until Stripe is configured.

Live carrier rates require an EasyPost API key **and** the private Ship-From Address saved under **Owner → Site Content**.

## 4. Customer file uploads

Production customer attachments fail closed unless malware scanning is configured.

```env
CUSTOMER_UPLOAD_SCANNER=clamav
CLAMSCAN_PATH=clamscan
```

If ClamAV is not installed on the production host, customers can still submit requests without attachments, but attachment uploads will be rejected for safety.

## 5. First public launch

After Railway provides the public HTTPS domain:

1. Set `NEXT_PUBLIC_SITE_URL` to that exact origin, with no trailing path.
2. Redeploy.
3. Visit `/api/health` and confirm `"ok": true`.
4. Open the public Home, Gallery, Queue, Login, and Custom Request pages.
5. Use the hidden owner entrance and immediately confirm Owner → Security & Backups.
6. Under Owner → Site Content, save the private Ship-From Address used for shipping rates.
7. Verify the Security & Backups page reports the EasyPost API and Ship-From Address status correctly.
8. Submit a real test request using an email address you control.
9. Verify that the request appears in Owner → Production and in the signed-in customer profile.

## 6. Custom domain

Once the Railway-provided domain works correctly, connect the final Mesh Harbor 3D domain in Railway Networking and update:

```env
NEXT_PUBLIC_SITE_URL=https://YOUR-FINAL-DOMAIN.com
```

Then redeploy again. Update Cloudflare Turnstile, Stripe webhook, and any email-service domain settings to the final domain.

## 7. Stripe after launch

When you are ready to collect the 50% deposit:

1. Start with Stripe test-mode credentials.
2. Configure the production/test webhook endpoint:

```text
https://YOUR-DOMAIN/api/payments/stripe/webhook
```

3. Complete a full test quote → approval → 50% deposit workflow.
4. Only after that succeeds, replace the test secret with the live Stripe secret and live webhook signing secret.

## 8. EasyPost after launch

1. Add `EASYPOST_API_KEY` in Railway variables.
2. Sign into Owner → Site Content.
3. Enter and save the Ship-From Address.
4. Open Owner → Security & Backups and confirm both EasyPost and Ship-From Address show Ready.
5. Send a shipping quote with packed weight and box dimensions.
6. From the customer profile, enter a valid US address and press **Get Live Rates**.
7. Confirm USPS, UPS, and/or FedEx services appear.
