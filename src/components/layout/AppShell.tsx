import { NavLink, useLocation } from 'react-router-dom'
import { cx } from '@/utils'
import { useAuth } from '@/hooks/useAuth'

interface NavItem {
  to: string
  icon: string
  label: string
  title: string
}

const NAV: NavItem[] = [
  { to: '/chat',   icon: '◇', label: 'Chat',   title: 'Chat'   },
  { to: '/files',  icon: '◱', label: 'Files',  title: 'Files'  },
  { to: '/skills', icon: '⊛', label: 'Skills', title: 'Skills' },
  { to: '/ops',    icon: '⊞', label: 'Ops',    title: 'Ops'    },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { clear } = useAuth()
  const location = useLocation()

  return (
    <div className="flex h-screen bg-hive-bg overflow-hidden">
      {/* ── Side nav ── */}
      <nav className="flex flex-col items-center w-14 bg-hive-surface border-r border-hive-border py-3 shrink-0 z-10">
        {/* Logo mark */}
        <div className="mb-4 w-8 h-8 rounded-lg bg-hive-bg border border-hive-border flex items-center justify-center">
          <svg viewBox="0 0 32 32" className="w-5 h-5">
            <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="#7c75ed" opacity="0.85"/>
            <polygon points="16,7 23,11 23,21 16,25 9,21 9,11" fill="#1c2a3e"/>
            <circle cx="16" cy="16" r="3.5" fill="#7c75ed"/>
          </svg>
        </div>

        {/* Nav links */}
        <div className="flex flex-col gap-1 flex-1">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.title}
              className={({ isActive }) => cx(
                'flex flex-col items-center gap-0.5 w-10 h-10 rounded-hive transition-all',
                'text-2xs font-medium select-none',
                isActive
                  ? 'bg-hive-accentSoft text-hive-accent border border-hive-accent/30'
                  : 'text-hive-textDim hover:text-hive-textSoft hover:bg-hive-surfaceHi',
              )}
            >
              <span className="text-base leading-none mt-2">{item.icon}</span>
              <span className="leading-none">{item.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Sign out */}
        <button
          onClick={clear}
          title="Disconnect"
          className="w-10 h-10 rounded-hive text-hive-textDim hover:text-hive-error hover:bg-red-900/20 transition-all flex items-center justify-center text-sm"
        >
          ⏻
        </button>
      </nav>

      {/* ── Page content ── */}
      <main className="flex-1 overflow-hidden animate-fade-in">
        {children}
      </main>
    </div>
  )
}
