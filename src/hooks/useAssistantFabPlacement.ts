import { useCallback, useEffect, useState } from 'react'
import {
  getAssistantFabPlacement,
  setAssistantFabPlacement,
  subscribeAssistantFabPlacement,
  type AssistantFabPlacement,
} from '../utils/assistantFabPlacement'

/** React binding for float vs docked Assistant buddy placement. */
export function useAssistantFabPlacement(mode: 'client' | 'admin') {
  const [placement, setPlacementState] = useState<AssistantFabPlacement>(() =>
    getAssistantFabPlacement(mode)
  )

  useEffect(() => {
    setPlacementState(getAssistantFabPlacement(mode))
    return subscribeAssistantFabPlacement(mode, () => {
      setPlacementState(getAssistantFabPlacement(mode))
    })
  }, [mode])

  const setPlacement = useCallback(
    (next: AssistantFabPlacement) => {
      setAssistantFabPlacement(mode, next)
    },
    [mode]
  )

  return { placement, setPlacement, isDocked: placement === 'dock' }
}
