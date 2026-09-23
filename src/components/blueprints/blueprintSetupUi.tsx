import { createContext, useContext } from 'react'

/** When true, incomplete Then-do tasks show a red X (after Run). */
export const BlueprintRevealMissingContext = createContext(false)

export function useRevealMissingSetup(): boolean {
  return useContext(BlueprintRevealMissingContext)
}
