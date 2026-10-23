# Owner text alerts and auto-queue

New environment variables (set on Railway; never commit values):

```
# Preferred: Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
OWNER_PHONE=+19288211043
# Fallback: carrier email-to-SMS gateway sent through Resend
# e.g. 9288211043@vtext.com (Verizon), @txt.att.net (AT&T), @tmomail.net (T-Mobile)
OWNER_SMS_GATEWAY=
# Email copy of alerts; defaults to REQUEST_TO_EMAIL
OWNER_ALERT_EMAIL=
# Queue a request automatically once its deposit is paid (default on)
AUTO_QUEUE_ON_DEPOSIT=true
```

Alerts fire on: new custom request, deposit paid (and auto-queued, with an email copy), final balance paid, and shipping label review required. Alerts never throw; a failed text never blocks an order.
