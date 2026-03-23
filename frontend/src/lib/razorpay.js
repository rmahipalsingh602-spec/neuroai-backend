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
  await appendScript()

  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Razorpay checkout is unavailable right now.'))
      return
    }

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
