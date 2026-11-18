import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router'

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
  available: boolean
  payload: InspectorPayload
  setOpen: (open: boolean) => void
  toggle: () => void
  setPayload: (payload: InspectorPayload) => void
}

const defaultPayload: InspectorPayload = {
  eyebrow: 'Inspector',
  title: 'Nothing selected',
  description: 'Select a message, file or operation to inspect its details.',
}

const InspectorContext = createContext<InspectorContextValue | null>(null)

export function InspectorProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const previousPath = useRef(pathname)
  const [requestedOpen, setOpen] = useState(false)
  const [selection, setSelection] = useState<{ pathname: string; payload: InspectorPayload } | null>(null)
  useEffect(() => {
    if (previousPath.current === pathname) return
    previousPath.current = pathname
    setOpen(false)
    setSelection(null)
  }, [pathname])
  const available = selection?.pathname === pathname
  const open = requestedOpen && available
  const payload = available && selection ? selection.payload : defaultPayload
  const setPayload = useCallback((next: InspectorPayload) => {
    setSelection({ pathname, payload: next })
  }, [pathname])
  const toggle = useCallback(() => {
    if (available) setOpen((current) => !current)
  }, [available])
  const value = useMemo(() => ({ open, available, payload, setOpen, toggle, setPayload }), [open, available, payload, toggle, setPayload])
  return <InspectorContext.Provider value={value}>{children}</InspectorContext.Provider>
}

export function useInspector(): InspectorContextValue {
  const value = useContext(InspectorContext)
  if (!value) throw new Error('useInspector must be used inside InspectorProvider')
  return value
}
