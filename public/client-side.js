let stripe;
let elements;
let testEmail;
let paymentIntentId;

// Initialize the payment form
async function initialize() {
  try {
    // Step 1: Fetch publishable key and test email from server
    const configResponse = await fetch('/config');
    const { publishableKey, testEmail: email } = await configResponse.json();
    testEmail = email;
    stripe = Stripe(publishableKey);

    // Step 2: Create PaymentIntent (so Elements knows about mandate)
    const piResponse = await fetch('/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const { clientSecret, paymentIntentId: piId } = await piResponse.json();
    paymentIntentId = piId;
    console.log('PaymentIntent created:', paymentIntentId);

    // Step 3: Initialize Stripe Elements WITH clientSecret
    elements = stripe.elements({
      clientSecret,
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

// Handle form submission
document.getElementById('payment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setLoading(true);

  try {
    // Client-side confirmation with Stripe.js
    // This handles the entire flow including mandate_data
    const {error, paymentIntent} = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + '/success',
        payment_method_data: {
          billing_details: {
            email: testEmail, // Include test email for mandate testing
          },
        },
        mandate_data: {
          customer_acceptance: {
            type: 'online',
            online: {
              ip_address: '127.0.0.0',
              user_agent: navigator.userAgent,
            },
          },
        },
      },
      redirect: 'if_required', // Don't redirect unless absolutely necessary
    });

    if (error) {
      // Error during confirmation
      showError(error.message);
      setLoading(false);
    } else if (paymentIntent) {
      // Payment confirmed without redirect
      if (paymentIntent.status === 'requires_action') {
        // UPI requires polling
        showSuccess('Waiting for UPI payment confirmation...');
        await pollPaymentStatus(paymentIntent.client_secret);
      } else if (paymentIntent.status === 'succeeded') {
        showSuccess('Payment successful! Payment method saved for future use.');
        setTimeout(() => {
          window.location.href = '/success';
        }, 2000);
      } else if (paymentIntent.status === 'processing') {
        showSuccess('Payment is processing...');
        await pollPaymentStatus(paymentIntent.client_secret);
      } else {
        showSuccess(`Payment ${paymentIntent.status}`);
        setLoading(false);
      }
    }
  } catch (error) {
    console.error('Payment error:', error);
    showError(error.message);
    setLoading(false);
  }
});

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
        showError(`Payment ${paymentIntent.status}`);
        setLoading(false);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (error) {
      console.error('Polling error:', error);
      showError('Failed to check payment status');
      setLoading(false);
      return;
    }
  }

  showError('Payment confirmation timed out. Please check your payment status.');
  setLoading(false);
}

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

// Initialize on page load
initialize();
