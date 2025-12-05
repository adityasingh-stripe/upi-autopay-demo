# UPI Autopay Demo

A demo application showcasing UPI payment integration with autopay (recurring payment) capabilities using Stripe. This project implements both server-side and client-side confirmation.

## Overview

This demo application demonstrates how to implement UPI payments with `setup_future_usage` for recurring payments (autopay) using Stripe's Payment Intents API. The application supports two implementation patterns:

- **Server-Side Confirmation**: Uses `createPaymentMethod` with server-controlled confirmation logic
- **Client-Side Confirmation**: Uses `confirmPayment` with Stripe.js handling confirmation

Both patterns properly handle mandate data requirements for UPI autopay and demonstrate best practices for production implementations.

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
- **Payment Amount**: ₹424.24 INR (42,424 paise)
- **Mandate Limits**:
  - Server-side flow: Maximum ₹150.00 per transaction
  - Client-side flow: Maximum ₹1000.00 per transaction
- **Polling**: Payment status checked every 3 seconds for up to 2 minutes
- **Email**: Automatically configured from environment variable

### Testing Flows

1. **Server-Side Flow** (`/server-side`):
   - Client creates payment method manually
   - Server confirms payment with full control
   - Requires polling for UPI status updates

2. **Client-Side Flow** (`/client-side`):
   - Stripe.js handles confirmation automatically
   - Simpler implementation with less code
   - Auto-completes in test mode

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
│   └── styles.css           # Application styles
├── package.json             # Dependencies and scripts
├── .env.example             # Environment variable template
├── .env                     # Your environment variables (gitignored)
└── README.md                # This file
```

## API Endpoints

### GET /config
Returns public configuration for client initialization.

**Response:**
```json
{
  "publishableKey": "pk_test_...",
  "testEmail": "succeed_immediately@example.com"
}
```

### POST /create-payment-intent
Creates a PaymentIntent with UPI mandate options.

**Response:**
```json
{
  "clientSecret": "pi_xxx_secret_xxx",
  "paymentIntentId": "pi_xxx"
}
```

### POST /confirm-payment
Confirms PaymentIntent (server-side flow).

**Request:**
```json
{
  "paymentIntentId": "pi_xxx",
  "paymentMethodId": "pm_xxx",
  "mandateData": {
    "customer_acceptance": {
      "type": "online",
      "online": {
        "ip_address": "127.0.0.0",
        "user_agent": "Mozilla/5.0..."
      }
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "paymentIntent": { ... },
  "requiresAction": true,
  "nextActionUrl": null
}
```

### POST /confirm-payment-client-side
Confirms PaymentIntent using confirmation token (client-side flow).

**Request:**
```json
{
  "paymentIntentId": "pi_xxx",
  "confirmationTokenId": "ctoken_xxx"
}
```

**Response:**
```json
{
  "success": true,
  "paymentIntent": { ... },
  "requiresAction": false,
  "nextActionUrl": null
}
```

## Technical Implementation

### Server-Side Confirmation Flow

1. Server creates PaymentIntent with `setup_future_usage` and mandate options
2. Client initializes Elements with `clientSecret` and `paymentMethodCreation: 'manual'`
3. User enters payment details (address and VPA)
4. Client validates and creates payment method using `stripe.createPaymentMethod()`
5. Client sends payment method and mandate data to server
6. Server confirms PaymentIntent with both parameters
7. Client polls for payment status until completion

### Client-Side Confirmation Flow

1. Server creates PaymentIntent with `setup_future_usage` and mandate options
2. Client initializes Elements with `clientSecret`
3. User enters payment details (address and VPA)
4. Client calls `stripe.confirmPayment()` with mandate data
5. Stripe.js handles confirmation automatically
6. Client polls for payment status until completion

### Mandate Data Requirements

UPI payments with `setup_future_usage` require `mandate_data` containing:

- `customer_acceptance.type`: Must be `'online'` or `'offline'`
- `customer_acceptance.online.ip_address`: Customer's IP address
- `customer_acceptance.online.user_agent`: Customer's browser user agent


## License

MIT

## Support

For questions or issues:
- Review code comments in `server.js` and JavaScript files
- Check Stripe Dashboard API logs
- Reach out the Author (@adityasingh)
