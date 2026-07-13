import { lazy, Suspense } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { LoginScreen } from './components/LoginScreen'
import { useAuth } from './context/AuthContext'
import { ChatProvider } from './context/ChatContext'
import { InspectorProvider } from './context/InspectorContext'

const ChatPage = lazy(() => import('./pages/ChatPage').then((module) => ({ default: module.ChatPage })))
const FilesPage = lazy(() => import('./pages/FilesPage').then((module) => ({ default: module.FilesPage })))
const SkillsPage = lazy(() => import('./pages/SkillsPage').then((module) => ({ default: module.SkillsPage })))
const OpsPage = lazy(() => import('./pages/OpsPage').then((module) => ({ default: module.OpsPage })))
const RepositoryMemoryPage = lazy(() =>
  import('./pages/RepositoryMemoryPage').then((module) => ({ default: module.RepositoryMemoryPage })),
)
const ModelRegistryPage = lazy(() =>
  import('./pages/ModelRegistryPage').then((module) => ({ default: module.ModelRegistryPage })),
)
const RepositoriesPage = lazy(() =>
  import('./pages/RepositoriesPage').then((module) => ({ default: module.RepositoriesPage })),
)
const RepositoryIntelligencePage = lazy(() =>
  import('./pages/RepositoryIntelligencePage').then((module) => ({ default: module.RepositoryIntelligencePage })),
)
const IntegrationsPage = lazy(() =>
  import('./pages/IntegrationsPage').then((module) => ({ default: module.IntegrationsPage })),
)
const CouncilPage = lazy(() =>
  import('./pages/CouncilPage').then((module) => ({ default: module.CouncilPage })),
)
const ExecutionReviewsPage = lazy(() =>
  import('./pages/ExecutionReviewsPage').then((module) => ({ default: module.ExecutionReviewsPage })),
)
const ExecutionSimulationPage = lazy(() =>
  import('./pages/ExecutionSimulationPage').then((module) => ({ default: module.ExecutionSimulationPage })),
)
const OptimisationPage = lazy(() =>
  import('./pages/OptimisationPage').then((module) => ({ default: module.OptimisationPage })),
)
const MonthlyReviewPage = lazy(() =>
  import('./pages/MonthlyReviewPage').then((module) => ({ default: module.MonthlyReviewPage })),
)

function LoadingScreen({ compact = false }: { compact?: boolean }) {
  return (
    <main className={`flex items-center justify-center bg-[#061126] text-slate-400 ${compact ? 'h-full' : 'min-h-screen'}`}>
      <LoaderCircle className="mr-2 h-5 w-5 animate-spin text-cyan-300" /> Verifying HIVE access
    </main>
  )
}

export default function App() {
  const { status } = useAuth()

  if (status === 'checking') return <LoadingScreen />
  if (status === 'signed-out') return <LoginScreen />

  return (
    <InspectorProvider>
      <ChatProvider>
        <Suspense fallback={<LoadingScreen compact />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/chat" replace />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="files" element={<FilesPage />} />
              <Route path="skills" element={<SkillsPage />} />
              <Route path="memory" element={<RepositoryMemoryPage />} />
              <Route path="repositories" element={<RepositoriesPage />} />
              <Route path="intelligence" element={<RepositoryIntelligencePage />} />
              <Route path="integrations" element={<IntegrationsPage />} />
              <Route path="council" element={<CouncilPage />} />
              <Route path="execution-reviews" element={<ExecutionReviewsPage />} />
              <Route path="execution-simulation" element={<ExecutionSimulationPage />} />
              <Route path="optimisation" element={<OptimisationPage />} />
              <Route path="monthly-review" element={<MonthlyReviewPage />} />
              <Route path="models" element={<ModelRegistryPage />} />
              <Route path="ops" element={<OpsPage />} />
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </ChatProvider>
    </InspectorProvider>
  )
}
