# UPI Autopay Demo

Stripe UPI payment integration with autopay (recurring) capabilities.

## Flows

| Flow | API | Charge |
|------|-----|--------|
| **Server-Side PI** | PaymentIntent | Immediate + saves PM |
| **Client-Side PI** | PaymentIntent | Immediate + saves PM |
| **SetupIntent** | SetupIntent | None (saves PM only) |

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
TEST_BILLING_EMAIL=succeed_immediately@example.com
```

## Run

```bash
npm start        # or
npm run dev      # with auto-reload
```

Open `http://localhost:3000`

## Test Emails

| Email | Behavior |
|-------|----------|
| `succeed_immediately@example.com` | Instant success (default) |
| `succeed_after_5_min@example.com` | Success after 5 min |
| `succeed@example.com` | Success after 24h |
| `fail@example.com` | Fails immediately |

## API Endpoints

- `GET /config` - Publishable key + test email
- `POST /create-payment-intent` - Create PI with mandate options
- `POST /confirm-payment` - Server-side PI confirmation
- `POST /create-setup-intent` - Create SI (no charge, saves PM)
- `POST /charge-saved-method` - Charge saved PM off-session

## Structure

```
├── server.js
└── public/
    ├── home.html
    ├── server-side.{html,js}
    ├── client-side.{html,js}
    ├── setup-intent.{html,js}
    └── styles.css
```

## Gates Required

**Domestic UPI Autopay:**
- `enable_payment_method_api_upi`
- `enable_upi_autopay`

**Cross-border UPI (QR code):**
- Non-IN merchant account
- `upi_qrcode_for_mandate_setup` flag

## License

MIT
