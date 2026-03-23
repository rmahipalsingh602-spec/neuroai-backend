export const PRIVACY_POLICY = {
  title: 'Privacy Policy',
  updatedOn: '23 March 2026',
  intro:
    'NeuroAI stores account details, uploaded files, and chat activity only to deliver your workspace, document answers, voice playback, billing, and support.',
  sections: [
    {
      title: 'What We Collect',
      points: [
        'Your email address, encrypted password hash, plan status, and session tokens.',
        'Uploaded documents, chat requests, AI responses, and voice preferences needed to run the product.',
        'Payment verification details from Razorpay when you upgrade to Pro.',
      ],
    },
    {
      title: 'How We Use Data',
      points: [
        'To authenticate you, restore your session, and keep your workspace available after login.',
        'To answer questions from your uploaded documents and save conversation history for you.',
        'To prevent abuse, manage free-plan usage, and provide billing or technical support.',
      ],
    },
    {
      title: 'Storage And Security',
      points: [
        'Passwords are never stored in plain text.',
        'Session refresh tokens are rotated so long-term login can stay active more safely.',
        'We keep your data only as long as needed to operate the service or meet legal obligations.',
      ],
    },
    {
      title: 'Contact',
      points: [
        'For privacy requests, billing questions, or deletion requests, contact the NeuroAI support team from the app owner account.',
      ],
    },
  ],
}

export const TERMS_POLICY = {
  title: 'Terms & Conditions',
  updatedOn: '23 March 2026',
  intro:
    'By creating a NeuroAI account or using the service, you agree to use the platform responsibly and only with content you are allowed to upload and process.',
  sections: [
    {
      title: 'Account Use',
      points: [
        'You are responsible for keeping your account credentials secure.',
        'You must provide accurate signup information and must not impersonate another person or company.',
        'You may not abuse the platform, reverse engineer it, or use it for illegal or harmful activity.',
      ],
    },
    {
      title: 'Uploaded Content',
      points: [
        'You retain ownership of the documents and text you upload.',
        'You confirm that you have the rights and permissions needed to upload and process that content.',
        'NeuroAI may process that content only to provide search, chat, voice, analytics, and support related to your workspace.',
      ],
    },
    {
      title: 'Plans And Payments',
      points: [
        'Free-plan usage limits apply each month unless a Pro plan is activated.',
        'Paid upgrades are processed through Razorpay or the configured payment provider.',
        'Pricing, features, and plan limits may change in the future with reasonable notice.',
      ],
    },
    {
      title: 'Service Availability',
      points: [
        'We aim to keep the service available, but uptime is not guaranteed during maintenance, outages, or third-party failures.',
        'AI outputs can be helpful but should still be reviewed by the user before high-stakes decisions.',
      ],
    },
  ],
}

export const REFUND_POLICY = {
  title: 'Refund Policy',
  updatedOn: '23 March 2026',
  intro:
    'NeuroAI is a digital software subscription. There is no physical shipping, and paid access begins as soon as payment is verified.',
  sections: [
    {
      title: 'Refund Eligibility',
      points: [
        'If your payment was charged but Pro access was not activated, contact support with the payment reference for a manual fix or refund review.',
        'Duplicate payments or provider-side settlement issues can be reviewed case by case.',
        'Refunds are generally not available after successful activation and continued usage of the digital service, except where required by law.',
      ],
    },
    {
      title: 'Refund Timeline',
      points: [
        'Approved refunds are usually sent back to the original payment method within 5 to 7 business days, depending on the payment provider and bank.',
      ],
    },
    {
      title: 'Cancellation',
      points: [
        'You can stop using the service at any time.',
        'If recurring billing is introduced in the future, cancellation controls and timelines will be shown clearly before renewal.',
      ],
    },
    {
      title: 'Delivery',
      points: [
        'NeuroAI is delivered digitally inside your account dashboard. No shipping or physical delivery applies.',
      ],
    },
  ],
}
