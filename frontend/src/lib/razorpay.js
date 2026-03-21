function appendScript() {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-razorpay-checkout="true"]')
    if (existing) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.dataset.razorpayCheckout = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Razorpay checkout script'))
    document.body.appendChild(script)
  })
}

export async function openCheckout({ order, user }) {
  if (order.is_mock) {
    return {
      razorpay_order_id: order.order_id,
      razorpay_payment_id: `pay_mock_${Date.now()}`,
      razorpay_signature: 'mock_signature',
    }
  }

  await appendScript()

  return new Promise((resolve, reject) => {
    const razorpay = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: 'NeuroAI Pro',
      description: order.plan_name,
      order_id: order.order_id,
      prefill: {
        email: user.email,
      },
      theme: {
        color: '#0f172a',
      },
      handler: (response) => resolve(response),
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled')),
      },
    })

    razorpay.open()
  })
}
