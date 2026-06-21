import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export interface InspectorRow {
  label: string
  value: string
}

export interface InspectorPayload {
  eyebrow?: string
  title: string
  description?: string
  rows?: InspectorRow[]
  json?: unknown
  loading?: boolean
}

interface InspectorContextValue {
  open: boolean
  payload: InspectorPayload
  setOpen: (open: boolean) => void
  toggle: () => void
  setPayload: (payload: InspectorPayload) => void
}

const defaultPayload: InspectorPayload = {
  eyebrow: 'Inspector',
  title: 'Nothing selected',
  description: 'Select a message, file, skill or operation to inspect its details.',
}

const InspectorContext = createContext<InspectorContextValue | null>(null)

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [payload, setPayload] = useState<InspectorPayload>(defaultPayload)
  const toggle = useCallback(() => setOpen((current) => !current), [])
  const value = useMemo(() => ({ open, payload, setOpen, toggle, setPayload }), [open, payload, toggle])
  return <InspectorContext.Provider value={value}>{children}</InspectorContext.Provider>
}

export function useInspector(): InspectorContextValue {
  const value = useContext(InspectorContext)
  if (!value) throw new Error('useInspector must be used inside InspectorProvider')
  return value
}
