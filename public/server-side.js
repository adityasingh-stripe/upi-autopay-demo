let stripe;
let elements;
let paymentIntentId;
let testEmail;

// Initialize the payment form
async function initialize() {
  try {
    // Step 1: Fetch publishable key and test email from server
    const configResponse = await fetch('/config');
    const { publishableKey, testEmail: email } = await configResponse.json();
    testEmail = email;
    stripe = Stripe(publishableKey);

    // Step 2: Create PaymentIntent FIRST (so Elements knows about mandate)
    const piResponse = await fetch('/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const { clientSecret, paymentIntentId: piId } = await piResponse.json();
    paymentIntentId = piId;
    console.log('PaymentIntent created:', paymentIntentId);

    // Step 3: Initialize Stripe Elements WITH clientSecret
    // This way Elements knows about setup_future_usage and mandate_options
    elements = stripe.elements({
      clientSecret,
      paymentMethodCreation: 'manual', // Required for createPaymentMethod
      appearance: {
        theme: 'stripe',
        labels: 'above',
      },
    });

    // Create Address Element
    const addressElement = elements.create('address', {
      mode: 'shipping',
      allowedCountries: ['IN'],
    });
    addressElement.mount('#address-element');

    // Create Payment Element
    const paymentElement = elements.create('payment');
    paymentElement.mount('#payment-element');

    console.log('Elements initialized with mandate configuration');
  } catch (error) {
    showError(`Initialization failed: ${error.message}`);
  }
}

// Poll PaymentIntent status for UPI await_notification
async function pollPaymentStatus(clientSecret, maxAttempts = 40, intervalMs = 3000) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`Polling attempt ${attempts}/${maxAttempts}...`);

    try {
      const {paymentIntent} = await stripe.retrievePaymentIntent(clientSecret);
      console.log('Current status:', paymentIntent.status);

      if (paymentIntent.status === 'succeeded') {
        showSuccess('Payment successful! Autopay has been set up.');
        setLoading(false);
        setTimeout(() => {
          window.location.href = '/success';
        }, 2000);
        return;
      } else if (paymentIntent.status === 'processing') {
        showSuccess('Payment is processing...');
      } else if (paymentIntent.status === 'requires_payment_method') {
        showError('Payment failed. Please try again.');
        setLoading(false);
        return;
      } else if (paymentIntent.status !== 'requires_action') {
        // Any other terminal status
        showError(`Payment ${paymentIntent.status}`);
        setLoading(false);
        return;
      }

      // Status is still requires_action, continue polling
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (error) {
      console.error('Polling error:', error);
      showError('Failed to check payment status');
      setLoading(false);
      return;
    }
  }

  // Timeout after max attempts
  showError('Payment confirmation timed out. Please check your payment status.');
  setLoading(false);
}

// Handle form submission
document.getElementById('payment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setLoading(true);

  try {
    // Step 1: Submit elements to validate
    const {error: submitError} = await elements.submit();
    if (submitError) {
      showError(submitError.message);
      setLoading(false);
      return;
    }

    console.log('Elements validated');

    // Step 2: Create Payment Method (NOT Confirmation Token)
    // This is the key difference for server-side confirmation
    const {error: pmError, paymentMethod} = await stripe.createPaymentMethod({
      elements,
      params: {
        billing_details: {
          email: testEmail, // Include test email for UPI mandate testing
        },
      },
    });

    if (pmError) {
      showError(pmError.message);
      setLoading(false);
      return;
    }

    console.log('Payment Method created:', paymentMethod.id);

    // Step 3: Prepare mandate_data
    // This is required for UPI with setup_future_usage
    const mandateData = {
      customer_acceptance: {
        type: 'online',
        online: {
          ip_address: '127.0.0.0', // In production, get real IP from server
          user_agent: navigator.userAgent,
        },
      },
    };

    // Step 4: Send to server for confirmation
    const confirmResponse = await fetch('/confirm-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentIntentId,
        paymentMethodId: paymentMethod.id,
        mandateData,
      }),
    });

    const result = await confirmResponse.json();

    if (!confirmResponse.ok) {
      throw new Error(result.error || 'Payment confirmation failed');
    }

    console.log('Payment confirmed on server:', result);
    console.log('PaymentIntent status:', result.paymentIntent.status);
    console.log('Requires action:', result.requiresAction);
    console.log('Next action URL:', result.nextActionUrl);

    // Step 5: Handle next action if needed
    if (result.requiresAction) {
      if (result.nextActionUrl) {
        // Redirect-based flow (e.g., some payment methods)
        console.log('Redirecting to:', result.nextActionUrl);
        setTimeout(() => {
          window.location.href = result.nextActionUrl;
        }, 100);
        return;
      } else {
        // UPI await_notification flow - need to poll for status
        console.log('Payment requires action (upi_await_notification), starting to poll...');
        showSuccess('Waiting for UPI payment confirmation...');
        await pollPaymentStatus(result.paymentIntent.client_secret);
        return;
      }
    } else if (result.paymentIntent.status === 'succeeded') {
      showSuccess('Payment successful!');
      setTimeout(() => {
        window.location.href = '/success';
      }, 2000);
    } else {
      showSuccess(`Payment ${result.paymentIntent.status}`);
    }

  } catch (error) {
    console.error('Payment error:', error);
    showError(error.message);
    setLoading(false);
  }
});

// UI Helper Functions
function setLoading(isLoading) {
  const submitButton = document.getElementById('submit-button');
  const buttonText = document.getElementById('button-text');
  const spinner = document.getElementById('spinner');

  if (isLoading) {
    submitButton.disabled = true;
    buttonText.textContent = 'Processing...';
    spinner.classList.remove('hidden');
  } else {
    submitButton.disabled = false;
    buttonText.textContent = 'Pay Now & Setup Autopay';
    spinner.classList.add('hidden');
  }
}

function showError(message) {
  const errorDiv = document.getElementById('error-message');
  const successDiv = document.getElementById('success-message');

  successDiv.classList.add('hidden');
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');

  setTimeout(() => {
    errorDiv.classList.add('hidden');
  }, 5000);
}

function showSuccess(message) {
  const errorDiv = document.getElementById('error-message');
  const successDiv = document.getElementById('success-message');

  errorDiv.classList.add('hidden');
  successDiv.textContent = message;
  successDiv.classList.remove('hidden');
}

// Handle return from redirect
async function handleReturn() {
  const urlParams = new URLSearchParams(window.location.search);
  const paymentIntentClientSecret = urlParams.get('payment_intent_client_secret');

  if (paymentIntentClientSecret) {
    console.log('Returned from redirect, checking payment status...');

    try {
      const {paymentIntent} = await stripe.retrievePaymentIntent(paymentIntentClientSecret);

      console.log('Payment status:', paymentIntent.status);

      if (paymentIntent.status === 'succeeded') {
        showSuccess('Payment successful! Autopay has been set up.');
        setTimeout(() => {
          // Clean up URL and show success page
          window.history.replaceState({}, document.title, '/');
        }, 2000);
      } else if (paymentIntent.status === 'processing') {
        showSuccess('Payment is processing. Please wait...');
      } else if (paymentIntent.status === 'requires_payment_method') {
        showError('Payment failed. Please try again.');
        setTimeout(() => {
          window.history.replaceState({}, document.title, '/');
          window.location.reload();
        }, 3000);
      } else {
        showSuccess(`Payment status: ${paymentIntent.status}`);
      }
    } catch (error) {
      console.error('Error retrieving payment:', error);
      showError('Failed to verify payment status');
    }
  }
}

// Initialize on page load
initialize().then(() => {
  // Check if returning from redirect
  handleReturn();
});
