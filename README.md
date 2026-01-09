# UPI Autopay Demo

A demo application showcasing UPI payment integration with autopay (recurring payment) capabilities using Stripe. This project implements server-side confirmation, client-side confirmation, and SetupIntent flows.

## Overview

This demo application demonstrates how to implement UPI payments with `setup_future_usage` for recurring payments (autopay) using Stripe's Payment Intents API. The application supports three implementation patterns:

- **Server-Side Confirmation**: Uses `createPaymentMethod` with server-controlled confirmation logic
- **Client-Side Confirmation**: Uses `confirmPayment` with Stripe.js handling confirmation
- **SetupIntent Flow**: Saves payment method without charging (for subscriptions, free trials)

| Flow | API | Charge Today |
|------|-----|--------------|
| Server-Side PI | PaymentIntent | Yes + saves PM |
| Client-Side PI | PaymentIntent | Yes + saves PM |
| SetupIntent | SetupIntent | No (saves PM only) |

## Prerequisites

- Node.js v14 or higher
- Stripe account with UPI enabled
- Stripe test API keys

## Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd upi-autopay-demo
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` file with your Stripe credentials**

   ```env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   PORT=3000
   TEST_BILLING_EMAIL=succeed_immediately@example.com
   ```

## Running the Application

**Start the server:**

```bash
npm start
```

**For development with auto-reload:**

```bash
npm run dev
```

Open your browser and navigate to `http://localhost:3000`

## Testing

### Test Configuration

The application uses test emails to simulate different UPI autopay scenarios. Configure the test behavior by setting `TEST_BILLING_EMAIL` in your `.env` file:

| Test Email                        | Behavior                                | Use Case                           |
| --------------------------------- | --------------------------------------- | ---------------------------------- |
| `succeed_immediately@example.com` | Mandate and payment succeed immediately | Quick testing (default)            |
| `succeed_after_5_min@example.com` | Succeeds after 5 minutes                | Compressed timeline testing        |
| `succeed@example.com`             | Succeeds after 24h notice period        | Realistic production-like emulation|
| `fail@example.com`                | Mandate creation fails immediately      | Test error handling                |

### Test Payment Details

- **Test VPA**: Use any valid VPA format (e.g., `test@paytm`, `user@upi`)
- **Payment Amount**: ₹424.24 INR (42,424 paise) for PI flows, ₹0 for SetupIntent
- **Mandate Limits**: Maximum ₹1000.00 per transaction
- **Polling**: Payment status checked every 3 seconds for up to 2 minutes

### Testing Flows

1. **Server-Side Flow** (`/server-side`):
   - Client creates payment method manually
   - Server confirms payment with full control
   - Requires polling for UPI status updates

2. **Client-Side Flow** (`/client-side`):
   - Stripe.js handles confirmation automatically
   - Simpler implementation with less code
   - Auto-completes in test mode

3. **SetupIntent Flow** (`/setup-intent`):
   - No immediate charge
   - Creates Customer + saves PaymentMethod
   - Test off-session payments after setup

## Project Structure

```
upi-autopay-demo/
├── server.js                 # Express server with Stripe API endpoints
├── public/
│   ├── home.html            # Landing page with flow selection
│   ├── server-side.html     # Server-side confirmation demo UI
│   ├── server-side.js       # Server-side flow client logic
│   ├── client-side.html     # Client-side confirmation demo UI
│   ├── client-side.js       # Client-side flow client logic
│   ├── setup-intent.html    # SetupIntent demo UI
│   ├── setup-intent.js      # SetupIntent flow client logic
│   └── styles.css           # Application styles
├── package.json             # Dependencies and scripts
├── .env.example             # Environment variable template
├── .env                     # Your environment variables (gitignored)
└── README.md                # This file
```

## API Endpoints

### GET /config
Returns public configuration for client initialization.

### POST /create-payment-intent
Creates a PaymentIntent with UPI mandate options.

### POST /confirm-payment
Confirms PaymentIntent (server-side flow).

### POST /create-setup-intent
Creates a SetupIntent with Customer for saving payment method without charging.

**Response:**
```json
{
  "clientSecret": "seti_xxx_secret_xxx",
  "setupIntentId": "seti_xxx",
  "customerId": "cus_xxx"
}
```

### POST /confirm-setup-intent
Confirms SetupIntent (server-side flow).

### POST /charge-saved-method
Charges a saved payment method off-session (for testing future payments).

**Request:**
```json
{
  "customerId": "cus_xxx",
  "paymentMethodId": "pm_xxx",
  "amount": 10000
}
```

## Technical Implementation

### SetupIntent Flow

1. Server creates Customer + SetupIntent with mandate options
2. Client initializes Elements with `clientSecret`
3. User enters shipping address and VPA
4. Client calls `stripe.confirmSetup()` with mandate data
5. UPI mandate is created and payment method is attached to Customer
6. For future payments: use `paymentIntents.create()` with `off_session: true`

### Mandate Data Requirements

UPI payments with `setup_future_usage` or SetupIntent require `mandate_data` containing:

- `customer_acceptance.type`: Must be `'online'` or `'offline'`
- `customer_acceptance.online.ip_address`: Customer's IP address
- `customer_acceptance.online.user_agent`: Customer's browser user agent

## Gates Required

**Domestic UPI Autopay:**
- `enable_payment_method_api_upi`
- `enable_upi_autopay`

**Cross-border UPI (QR code flow):**
- Non-IN merchant account
- `upi_qrcode_for_mandate_setup` flag

## License

MIT

## Support

For questions or issues:
- Review code comments in `server.js` and JavaScript files
- Check Stripe Dashboard API logs
- Reach out the Author (@adityasingh)
