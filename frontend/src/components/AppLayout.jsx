import ThemeToggle from './ThemeToggle';
import logo from '../assets/logo.svg'; // Assuming you have a logo here

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
    </div>
  );
};

export default AppLayout;
