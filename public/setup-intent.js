let stripe;
let elements;
let testEmail;
let setupIntentId;
let customerId;
let savedPaymentMethodId;

// Initialize the setup form
async function initialize() {
  try {
    // Step 1: Fetch publishable key and test email from server
    const configResponse = await fetch('/config');
    const { publishableKey, testEmail: email } = await configResponse.json();
    testEmail = email;
    stripe = Stripe(publishableKey);

    // Step 2: Create SetupIntent (creates customer and returns clientSecret)
    const siResponse = await fetch('/create-setup-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const { clientSecret, setupIntentId: siId, customerId: cId } = await siResponse.json();
    setupIntentId = siId;
    customerId = cId;
    console.log('SetupIntent created:', setupIntentId);
    console.log('Customer created:', customerId);

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

    console.log('Elements initialized for SetupIntent');
  } catch (error) {
    showError(`Initialization failed: ${error.message}`);
  }
}

// Handle form submission
document.getElementById('payment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setLoading(true);

  try {
    // Client-side confirmation with Stripe.js for SetupIntent
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.origin + '/setup-success',
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
    } else if (setupIntent) {
      // Setup confirmed without redirect
      if (setupIntent.status === 'requires_action') {
        // UPI requires polling
        showSuccess('Waiting for UPI mandate confirmation...');
        await pollSetupStatus(setupIntent.client_secret);
      } else if (setupIntent.status === 'succeeded') {
        savedPaymentMethodId = setupIntent.payment_method;
        showSuccess('Payment method saved successfully!');
        showChargeSection();
        setLoading(false);
      } else if (setupIntent.status === 'processing') {
        showSuccess('Setup is processing...');
        await pollSetupStatus(setupIntent.client_secret);
      } else {
        showSuccess(`Setup ${setupIntent.status}`);
        setLoading(false);
      }
    }
  } catch (error) {
    console.error('Setup error:', error);
    showError(error.message);
    setLoading(false);
  }
});

// Poll SetupIntent status for UPI await_notification
async function pollSetupStatus(clientSecret, maxAttempts = 40, intervalMs = 3000) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`Polling attempt ${attempts}/${maxAttempts}...`);

    try {
      const { setupIntent } = await stripe.retrieveSetupIntent(clientSecret);
      console.log('Current status:', setupIntent.status);

      if (setupIntent.status === 'succeeded') {
        savedPaymentMethodId = setupIntent.payment_method;
        showSuccess('Payment method saved! Ready for future charges.');
        showChargeSection();
        setLoading(false);
        return;
      } else if (setupIntent.status === 'processing') {
        showSuccess('Setup is processing...');
      } else if (setupIntent.status === 'requires_payment_method') {
        showError('Setup failed. Please try again.');
        setLoading(false);
        return;
      } else if (setupIntent.status !== 'requires_action') {
        showError(`Setup ${setupIntent.status}`);
        setLoading(false);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (error) {
      console.error('Polling error:', error);
      showError('Failed to check setup status');
      setLoading(false);
      return;
    }
  }

  showError('Setup confirmation timed out. Please check your status.');
  setLoading(false);
}

// Show the charge section after successful setup
function showChargeSection() {
  const chargeSection = document.getElementById('charge-section');
  chargeSection.classList.remove('hidden');
  
  // Hide the form submit button
  document.getElementById('submit-button').style.display = 'none';
}

// Handle charging the saved payment method
document.getElementById('charge-button').addEventListener('click', async () => {
  const amountInput = document.getElementById('charge-amount');
  const chargeResult = document.getElementById('charge-result');
  const chargeButton = document.getElementById('charge-button');
  
  const amount = parseInt(amountInput.value) * 100; // Convert to paise
  
  if (!amount || amount < 100) {
    chargeResult.innerHTML = '<p style="color: #dc2626;">Please enter a valid amount (min ₹1)</p>';
    return;
  }
  
  chargeButton.disabled = true;
  chargeButton.textContent = 'Processing...';
  chargeResult.innerHTML = '<p style="color: #6b7280;">Charging payment method...</p>';

  try {
    const response = await fetch('/charge-saved-method', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId,
        paymentMethodId: savedPaymentMethodId,
        amount,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to charge payment method');
    }

    console.log('Charge result:', result);
    
    if (result.paymentIntent.status === 'succeeded') {
      chargeResult.innerHTML = `
        <p style="color: #059669; font-weight: 500;">✓ Payment successful!</p>
        <p style="color: #6b7280; font-size: 13px; margin-top: 4px;">
          Amount: ₹${(result.paymentIntent.amount / 100).toFixed(2)} | 
          ID: ${result.paymentIntent.id}
        </p>
      `;
    } else if (result.paymentIntent.status === 'requires_action') {
      chargeResult.innerHTML = `
        <p style="color: #d97706; font-weight: 500;">⚠ Payment requires action</p>
        <p style="color: #6b7280; font-size: 13px; margin-top: 4px;">
          Status: ${result.paymentIntent.status}
        </p>
      `;
    } else {
      chargeResult.innerHTML = `
        <p style="color: #6b7280;">Payment status: ${result.paymentIntent.status}</p>
      `;
    }
  } catch (error) {
    console.error('Charge error:', error);
    chargeResult.innerHTML = `<p style="color: #dc2626;">Error: ${error.message}</p>`;
  } finally {
    chargeButton.disabled = false;
    chargeButton.textContent = 'Charge Now';
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
    buttonText.textContent = 'Save Payment Method';
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
  const setupIntentClientSecret = urlParams.get('setup_intent_client_secret');

  if (setupIntentClientSecret) {
    console.log('Returned from redirect, checking setup status...');

    try {
      const { setupIntent } = await stripe.retrieveSetupIntent(setupIntentClientSecret);

      console.log('Setup status:', setupIntent.status);

      if (setupIntent.status === 'succeeded') {
        savedPaymentMethodId = setupIntent.payment_method;
        showSuccess('Payment method saved successfully!');
        showChargeSection();
      } else if (setupIntent.status === 'processing') {
        showSuccess('Setup is processing. Please wait...');
      } else if (setupIntent.status === 'requires_payment_method') {
        showError('Setup failed. Please try again.');
        setTimeout(() => {
          window.history.replaceState({}, document.title, '/setup-intent');
          window.location.reload();
        }, 3000);
      } else {
        showSuccess(`Setup status: ${setupIntent.status}`);
      }
    } catch (error) {
      console.error('Error retrieving setup:', error);
      showError('Failed to verify setup status');
    }
  }
}

// Initialize on page load
initialize().then(() => {
  // Check if returning from redirect
  handleReturn();
});

