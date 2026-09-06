import { useContext } from 'react'
import { CustomerStoreContext } from './customer-store-context'

export function useCustomerStore() {
  const store = useContext(CustomerStoreContext)

  if (!store) {
    throw new Error('useCustomerStore must be used inside CustomerStoreProvider')
  }

  return store
}