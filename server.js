require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// Route handlers
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/home.html");
});

app.get("/server-side", (req, res) => {
  res.sendFile(__dirname + "/public/server-side.html");
});

app.get("/client-side", (req, res) => {
  res.sendFile(__dirname + "/public/client-side.html");
});

app.get("/setup-intent", (req, res) => {
  res.sendFile(__dirname + "/public/setup-intent.html");
});

app.get("/config", (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    testEmail:
      process.env.TEST_BILLING_EMAIL || "succeed_immediately@example.com",
  });
});

// Create Payment Intent with setup_future_usage
app.post("/create-payment-intent", async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 42424,
      currency: "inr",
      setup_future_usage: "off_session", // Enable autopay
      payment_method_options: {
        upi: {
          mandate_options: {
            description: "Monthly subscription",
            amount: 100000, // 1000 INR
            amount_type: "maximum",
            end_date: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year from now
          },
        },
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).json({ error: error.message });
  }
});

// Confirm Payment Intent (server-side confirmation)
app.post("/confirm-payment", async (req, res) => {
  try {
    const { paymentIntentId, paymentMethodId, mandateData } = req.body;

    if (!paymentIntentId || !paymentMethodId || !mandateData) {
      return res.status(400).json({
        error:
          "Missing required fields: paymentIntentId, paymentMethodId, or mandateData",
      });
    }

    // Confirm the PaymentIntent with payment_method and mandate_data
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
      mandate_data: mandateData,
      return_url: `${req.protocol}://${req.get("host")}/`,
    });

    // For recurring payments, you would:
    // 1. Create a Customer: const customer = await stripe.customers.create({ email: testEmail });
    // 2. Attach PaymentMethod: await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
    // 3. Use the customer for future charges

    console.log("Payment confirmed. Status:", paymentIntent.status);
    console.log("Requires action:", paymentIntent.status === "requires_action");
    console.log(
      "Next action:",
      JSON.stringify(paymentIntent.next_action, null, 2)
    );

    res.json({
      success: true,
      paymentIntent: paymentIntent,
      requiresAction: paymentIntent.status === "requires_action",
      nextActionUrl: paymentIntent.next_action?.redirect_to_url?.url,
    });
  } catch (error) {
    console.error("Error confirming payment:", error);
    res.status(500).json({
      error: error.message,
      type: error.type,
    });
  }
});

// Confirm Payment Intent with Confirmation Token (client-side flow)
app.post("/confirm-payment-client-side", async (req, res) => {
  try {
    const { paymentIntentId, confirmationTokenId } = req.body;

    if (!paymentIntentId || !confirmationTokenId) {
      return res.status(400).json({
        error: "Missing required fields: paymentIntentId or confirmationTokenId",
      });
    }

    // Confirm the PaymentIntent with confirmation_token
    // The confirmation token already contains payment_method_data and mandate_data
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      confirmation_token: confirmationTokenId,
      return_url: `${req.protocol}://${req.get("host")}/success`,
    });

    console.log("Payment confirmed with Confirmation Token. Status:", paymentIntent.status);

    res.json({
      success: true,
      paymentIntent: paymentIntent,
      requiresAction: paymentIntent.status === "requires_action",
      nextActionUrl: paymentIntent.next_action?.redirect_to_url?.url,
    });
  } catch (error) {
    console.error("Error confirming payment with confirmation token:", error);
    res.status(500).json({
      error: error.message,
      type: error.type,
    });
  }
});

// Create Setup Intent for saving payment method (no immediate charge)
app.post("/create-setup-intent", async (req, res) => {
  try {
    // First, create or retrieve a customer
    const customer = await stripe.customers.create({
      email: process.env.TEST_BILLING_EMAIL || "succeed_immediately@example.com",
    });

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ["upi"],
      payment_method_options: {
        upi: {
          mandate_options: {
            description: "Monthly autopay",
            amount: 100000, // 1000 INR maximum
            amount_type: "maximum",
            end_date: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year from now
          },
        },
      },
    });

    res.json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      customerId: customer.id,
    });
  } catch (error) {
    console.error("Error creating setup intent:", error);
    res.status(500).json({ error: error.message });
  }
});

// Confirm Setup Intent (server-side confirmation)
app.post("/confirm-setup-intent", async (req, res) => {
  try {
    const { setupIntentId, paymentMethodId, mandateData } = req.body;

    if (!setupIntentId || !paymentMethodId || !mandateData) {
      return res.status(400).json({
        error: "Missing required fields: setupIntentId, paymentMethodId, or mandateData",
      });
    }

    // Confirm the SetupIntent with payment_method and mandate_data
    const setupIntent = await stripe.setupIntents.confirm(setupIntentId, {
      payment_method: paymentMethodId,
      mandate_data: mandateData,
      return_url: `${req.protocol}://${req.get("host")}/setup-success`,
    });

    console.log("SetupIntent confirmed. Status:", setupIntent.status);
    console.log("Next action:", JSON.stringify(setupIntent.next_action, null, 2));

    res.json({
      success: true,
      setupIntent: setupIntent,
      requiresAction: setupIntent.status === "requires_action",
      nextActionUrl: setupIntent.next_action?.redirect_to_url?.url,
    });
  } catch (error) {
    console.error("Error confirming setup intent:", error);
    res.status(500).json({
      error: error.message,
      type: error.type,
    });
  }
});

// Charge saved payment method (for testing future payments)
app.post("/charge-saved-method", async (req, res) => {
  try {
    const { customerId, paymentMethodId, amount } = req.body;

    if (!customerId || !paymentMethodId) {
      return res.status(400).json({
        error: "Missing required fields: customerId or paymentMethodId",
      });
    }

    // Create a PaymentIntent using the saved payment method
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount || 10000, // Default 100 INR
      currency: "inr",
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
    });

    console.log("Off-session payment created. Status:", paymentIntent.status);

    res.json({
      success: true,
      paymentIntent: paymentIntent,
    });
  } catch (error) {
    console.error("Error charging saved method:", error);
    res.status(500).json({
      error: error.message,
      type: error.type,
    });
  }
});

// Setup success page
app.get("/setup-success", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Setup Successful</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div class="container">
          <h1>Payment Method Saved!</h1>
          <p>Your UPI payment method has been saved for future autopay transactions.</p>
          <a href="/">Back to Home</a>
        </div>
      </body>
    </html>
  `);
});

// Success page
app.get("/success", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Successful</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div class="container">
          <h1>Payment Successful!</h1>
          <p>Your UPI payment has been confirmed and set up for autopay.</p>
          <a href="/">Make another payment</a>
        </div>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Make sure to set STRIPE_SECRET_KEY in your .env file");
});
