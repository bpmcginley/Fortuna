import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Scenario } from '../engine/types'
import { reducer, seedDefault, type Action } from './scenario'
import { newProfile, type Profile } from './profiles'

const LS_V2 = 'fortuna:profiles:v2'
// v1 keys (single-scenario era) — migrated into the first profile once.
const LS_V1_CURRENT = 'fortuna:current:v1'
const LS_V1_SAVED = 'fortuna:saved:v1'

export interface SavedScenario {
  id: string
  scenario: Scenario
}

interface PState {
  activeId: string
  profiles: Profile[]
}

export interface ProfileSummary {
  id: string
  name: string
  color: string
}

interface StoreValue {
  // active-profile view (same surface the panels always used)
  scenario: Scenario
  dispatch: (a: Action) => void
  saved: SavedScenario[]
  saveCurrent: () => void
  deleteSaved: (id: string) => void
  loadSaved: (id: string) => void
  // profiles
  profiles: ProfileSummary[]
  activeId: string
  switchProfile: (id: string) => void
  createProfile: (name: string, scenario?: Scenario) => void
  renameProfile: (id: string, name: string) => void
  duplicateProfile: (id: string) => void
  deleteProfile: (id: string) => void
}

const Ctx = createContext<StoreValue | null>(null)

const deepCopy = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

// True when this launch found NO usable stored data (genuinely new user, or
// storage was corrupt) — the app opens the quick-setup wizard once.
let freshInstall = false
export function wasFreshInstall(): boolean {
  return freshInstall
}

function initialState(): PState {
  try {
    const raw = localStorage.getItem(LS_V2)
    if (raw) {
      const st = JSON.parse(raw) as PState
      if (st.profiles?.length) return st
    }
  } catch {
    /* corrupt storage — fall through */
  }
  // Migrate v1 single-scenario data if present.
  let scenario = seedDefault()
  let saved: SavedScenario[] = []
  let migrated = false
  try {
    const c = localStorage.getItem(LS_V1_CURRENT)
    if (c) {
      scenario = JSON.parse(c) as Scenario
      migrated = true
    }
    const sv = localStorage.getItem(LS_V1_SAVED)
    if (sv) saved = JSON.parse(sv) as SavedScenario[]
  } catch {
    /* ignore */
  }
  freshInstall = !migrated
  const p = newProfile('Me', scenario, 0)
  p.saved = saved
  return { activeId: p.id, profiles: [p] }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PState>(initialState)

  useEffect(() => {
    try {
      localStorage.setItem(LS_V2, JSON.stringify(state))
    } catch {
      /* storage full / disabled */
    }
  }, [state])

  const active = state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0]

  const mutateActive = useCallback((fn: (p: Profile) => Profile) => {
    setState((st) => ({
      ...st,
      profiles: st.profiles.map((p) => (p.id === st.activeId ? fn(p) : p)),
    }))
  }, [])

  const dispatch = useCallback(
    (a: Action) => mutateActive((p) => ({ ...p, scenario: reducer(p.scenario, a) })),
    [mutateActive],
  )

  const saveCurrent = useCallback(() => {
    mutateActive((p) => ({
      ...p,
      // keep at most 6 snapshots; drop the oldest
      saved: [...p.saved, { id: `${Date.now()}`, scenario: deepCopy(p.scenario) }].slice(-6),
    }))
  }, [mutateActive])

  const deleteSaved = useCallback(
    (id: string) => mutateActive((p) => ({ ...p, saved: p.saved.filter((s) => s.id !== id) })),
    [mutateActive],
  )

  const loadSaved = useCallback(
    (id: string) =>
      mutateActive((p) => {
        const found = p.saved.find((s) => s.id === id)
        return found ? { ...p, scenario: deepCopy(found.scenario) } : p
      }),
    [mutateActive],
  )

  const switchProfile = useCallback((id: string) => {
    setState((st) => (st.profiles.some((p) => p.id === id) ? { ...st, activeId: id } : st))
  }, [])

  const createProfile = useCallback((name: string, scenario?: Scenario) => {
    setState((st) => {
      const p = newProfile(name || `Profile ${st.profiles.length + 1}`, scenario ?? seedDefault(), st.profiles.length)
      return { activeId: p.id, profiles: [...st.profiles, p] }
    })
  }, [])

  const renameProfile = useCallback((id: string, name: string) => {
    if (!name.trim()) return
    setState((st) => ({
      ...st,
      profiles: st.profiles.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)),
    }))
  }, [])

  const duplicateProfile = useCallback((id: string) => {
    setState((st) => {
      const src = st.profiles.find((p) => p.id === id)
      if (!src) return st
      const copy = newProfile(`${src.name} (copy)`, deepCopy(src.scenario), st.profiles.length)
      copy.saved = deepCopy(src.saved)
      return { activeId: copy.id, profiles: [...st.profiles, copy] }
    })
  }, [])

  const deleteProfile = useCallback((id: string) => {
    setState((st) => {
      if (st.profiles.length <= 1) return st // never delete the last profile
      const profiles = st.profiles.filter((p) => p.id !== id)
      return { profiles, activeId: st.activeId === id ? profiles[0].id : st.activeId }
    })
  }, [])

  const value = useMemo<StoreValue>(
    () => ({
      scenario: active.scenario,
      dispatch,
      saved: active.saved,
      saveCurrent,
      deleteSaved,
      loadSaved,
      profiles: state.profiles.map((p) => ({ id: p.id, name: p.name, color: p.color })),
      activeId: active.id,
      switchProfile,
      createProfile,
      renameProfile,
      duplicateProfile,
      deleteProfile,
    }),
    [active, dispatch, saveCurrent, deleteSaved, loadSaved, state.profiles, switchProfile, createProfile, renameProfile, duplicateProfile, deleteProfile],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used within StoreProvider')
  return v
}
