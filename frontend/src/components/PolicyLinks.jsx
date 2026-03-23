import { Link } from 'react-router-dom'

const POLICY_LINKS = [
  { to: '/privacy-policy', label: 'Privacy Policy' },
  { to: '/terms-and-conditions', label: 'Terms & Conditions' },
  { to: '/refund-policy', label: 'Refund Policy' },
]

export default function PolicyLinks({ className = '', linkClassName = '' }) {
  return (
    <div className={`flex flex-wrap gap-3 text-xs text-slate-500 ${className}`.trim()}>
      {POLICY_LINKS.map((policyLink) => (
        <Link
          key={policyLink.to}
          to={policyLink.to}
          className={`font-semibold underline decoration-slate-300 underline-offset-4 ${linkClassName}`.trim()}
        >
          {policyLink.label}
        </Link>
      ))}
    </div>
  )
}
