import ThemeToggle from './ThemeToggle'
import logo from '../assets/logo.svg'
import PolicyLinks from './PolicyLinks.jsx'

const AppLayout = ({ children, user, onLogout }) => {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-charcoal-dark transition-colors duration-300">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-charcoal-dark/80 backdrop-blur-lg border-b border-slate-200/80 dark:border-charcoal-light/20">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <img src={logo} alt="NeuroAI Pro" className="h-8 w-auto" />
              <span className="text-xl font-bold text-slate-800 dark:text-white">NeuroAI Pro</span>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              {user && (
                <button
                  onClick={onLogout}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-charcoal-light rounded-lg hover:bg-slate-200 dark:hover:bg-charcoal transition"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="flex-grow container mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="border-t border-slate-200/80 bg-white/70 px-4 py-5 dark:border-charcoal-light/20 dark:bg-charcoal-dark/70">
        <div className="container mx-auto flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            NeuroAI keeps your login active, saves your workspace data, and provides clear policy access.
          </p>
          <PolicyLinks />
        </div>
      </footer>
    </div>
  )
}

export default AppLayout
