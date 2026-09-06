import { createContext } from 'react'
import type { CustomerStore } from './customer-store'

export const CustomerStoreContext = createContext<CustomerStore | null>(null)