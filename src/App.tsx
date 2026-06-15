import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TokenGate } from '@/components/layout/TokenGate'
import { AppShell } from '@/components/layout/AppShell'
import { ChatView } from '@/views/ChatView'
import { FilesView } from '@/views/FilesView'
import { SkillsView } from '@/views/SkillsView'
import { OpsView } from '@/views/OpsView'

export default function App() {
  return (
    <BrowserRouter>
      <TokenGate>
        <AppShell>
          <Routes>
            <Route path="/"                         element={<Navigate to="/chat" replace />} />
            <Route path="/chat"                     element={<ChatView />} />
            <Route path="/chat/:conversationId"     element={<ChatView />} />
            <Route path="/files"                    element={<FilesView />} />
            <Route path="/skills"                   element={<SkillsView />} />
            <Route path="/ops"                      element={<OpsView />} />
            <Route path="*"                         element={<Navigate to="/chat" replace />} />
          </Routes>
        </AppShell>
      </TokenGate>
    </BrowserRouter>
  )
}
