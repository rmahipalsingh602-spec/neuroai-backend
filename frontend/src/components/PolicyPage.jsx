import { Link } from 'react-router-dom'

export default function PolicyPage({ policy }) {
  return (
    <div className="mx-auto max-w-4xl py-10">
      <div className="rounded-[32px] border border-slate-200/80 bg-white/95 p-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">NeuroAI Policy</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">{policy.title}</h1>
            <p className="mt-3 text-sm text-slate-500">Last updated: {policy.updatedOn}</p>
          </div>
          <Link
            to="/"
            className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Back to Login
          </Link>
        </div>

        <p className="mt-6 rounded-3xl bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-600">
          {policy.intro}
        </p>

        <div className="mt-8 space-y-6">
          {policy.sections.map((section) => (
            <section
              key={section.title}
              className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.04)]"
            >
              <h2 className="text-2xl font-semibold text-slate-900">{section.title}</h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                {section.points.map((point) => (
                  <li key={point} className="rounded-2xl bg-slate-50 px-4 py-3">
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
