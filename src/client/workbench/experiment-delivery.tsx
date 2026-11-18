import { createContext } from 'react'
import type { WorkbenchUpdate } from '../../workbench-remote.ts'

export const WorkbenchDeliveryContext = createContext<Pick<WorkbenchUpdate, 'promptTurns'>>({ promptTurns: [] })
