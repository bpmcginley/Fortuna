import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react'
import type { Scenario } from '../engine/types'
import { reducer, seedDefault, type Action } from './scenario'

const LS_CURRENT = 'fortuna:current:v1'
const LS_SAVED = 'fortuna:saved:v1'

export interface SavedScenario {
  id: string
  scenario: Scenario
}

interface StoreValue {
  scenario: Scenario
  dispatch: (a: Action) => void
  saved: SavedScenario[]
  saveCurrent: () => void
  deleteSaved: (id: string) => void
  loadSaved: (id: string) => void
}

const Ctx = createContext<StoreValue | null>(null)

function readCurrent(): Scenario {
  try {
    const raw = localStorage.getItem(LS_CURRENT)
    if (raw) return JSON.parse(raw) as Scenario
  } catch {
    /* ignore corrupt storage */
  }
  return seedDefault()
}

function readSaved(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(LS_SAVED)
    if (raw) return JSON.parse(raw) as SavedScenario[]
  } catch {
    /* ignore */
  }
  return []
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [scenario, dispatch] = useReducer(reducer, undefined, readCurrent)
  const [saved, setSaved] = useState<SavedScenario[]>(readSaved)

  // Persist current scenario (debounced by React's batching; cheap enough live).
  useEffect(() => {
    try {
      localStorage.setItem(LS_CURRENT, JSON.stringify(scenario))
    } catch {
      /* storage full / disabled */
    }
  }, [scenario])

  useEffect(() => {
    try {
      localStorage.setItem(LS_SAVED, JSON.stringify(saved))
    } catch {
      /* ignore */
    }
  }, [saved])

  const saveCurrent = useCallback(() => {
    setSaved((prev) => {
      const snapshot: SavedScenario = { id: `${Date.now()}`, scenario: JSON.parse(JSON.stringify(scenario)) }
      // Keep at most 6 saved comparisons; drop the oldest.
      const next = [...prev, snapshot]
      return next.slice(-6)
    })
  }, [scenario])

  const deleteSaved = useCallback((id: string) => {
    setSaved((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const loadSaved = useCallback(
    (id: string) => {
      const found = saved.find((s) => s.id === id)
      if (found) dispatch({ type: 'load', scenario: JSON.parse(JSON.stringify(found.scenario)) })
    },
    [saved],
  )

  const value = useMemo<StoreValue>(
    () => ({ scenario, dispatch, saved, saveCurrent, deleteSaved, loadSaved }),
    [scenario, saved, saveCurrent, deleteSaved, loadSaved],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used within StoreProvider')
  return v
}
