import { ChevronLeft, ChevronRight, LoaderCircle, Search, SlidersHorizontal, UserRound, X } from 'lucide-react'
import { Form, Link, useLoaderData, useLocation, useNavigate, useNavigation } from 'react-router'
import { useState } from 'react'
import type { Route } from './+types/Users'
import { MultiSortManager, SortColumnHeader, type MultiSortRule } from '../../../components/admin/MultiSortControls'
import { toast } from '../../../lib/toast'
import { loadUsers } from '../../../lib/admin-users.server'

type CustomerOrder = {
  id: string
  status: string
  createdAt: string
  amount: number | null
  invoiceStatus: string | null
}
type Customer = {
  id: string
  qaffyId: string | null
  name: string
  email: string | null
  phone: string | null
  roles: string[]
  joinedAt: string
  orderCount: number
  totalSpend: number
  lastOrder: string | null
  oneOffBalance: number
  subscriptionBalance: number
  activePlan: string | null
  orders: CustomerOrder[]
}
type UsersData = {
  customers: Customer[]
  page: number
  pageSize: number
  total: number
  query: string
  roleFilter: string
  subscriptionFilter: string
  subscriptionPlans: Array<{ id: string; name: string; type: string }>
  activeSubscribers: number
  dateMode: 'all' | 'today' | 'this_month' | 'last_month' | 'custom'
  sortRules: UserSortRule[]
  startDate: string
  endDate: string
}
type UserSortColumn =
  'name' | 'qaffy_id' | 'role' | 'email' | 'phone' | 'orders' | 'total_paid' | 'wallet' | 'plan' | 'joined' | 'last_order'
type UserSortRule = MultiSortRule<UserSortColumn>
const sortableColumns: Array<{ value: UserSortColumn; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'qaffy_id', label: 'Qaffy ID' },
  { value: 'role', label: 'Role' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'orders', label: 'Orders' },
  { value: 'total_paid', label: 'Total paid' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'plan', label: 'Plan' },
  { value: 'joined', label: 'Joined date' },
  { value: 'last_order', label: 'Last order' },
]
function money(value: number) {
  return `₦${value.toLocaleString()}`
}
function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Not recorded'
}
const inputDate = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  return loadUsers(request)
}

function CopyValue({ value, label }: { value: string | null; label: string }) {
  const copy = async () => {
    if (value && navigator.clipboard) {
      await navigator.clipboard.writeText(value)
      toast.success(`${label[0].toUpperCase()}${label.slice(1)} copied`)
    }
  }
  return value ? (
    <button
      type="button"
      onClick={() => void copy()}
      title={`Copy ${label}`}
      className="max-w-52 truncate text-left text-sm text-slate-600 underline decoration-slate-200 underline-offset-2 hover:text-brand-primary"
    >
      {value}
    </button>
  ) : (
    <span className="text-sm text-slate-400">Unavailable</span>
  )
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

export function CustomerDetails({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[calc(100vh-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold capitalize tracking-[0.16em] text-brand-primary">Customer profile</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{customer.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{customer.qaffyId ?? 'Qaffy ID unavailable'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customer details"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-400"
          >
            ×
          </button>
        </header>
        <section className="mt-6 grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">Email</p>
            <div className="mt-1">
              <CopyValue value={customer.email} label="email" />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold capitalize tracking-[0.14em] text-slate-500">Phone</p>
            <div className="mt-1">
              <CopyValue value={customer.phone} label="phone number" />
            </div>
          </div>
          <Detail label="Roles" value={customer.roles.join(', ')} />
          <Detail label="Joined" value={date(customer.joinedAt)} />
          <Detail label="Active plan" value={customer.activePlan ?? 'One-time customer'} />
        </section>
        <section className="mt-5 grid gap-4 rounded-2xl border border-brand-border bg-brand-soft p-4 sm:grid-cols-3">
          <Detail label="One-off wallet" value={money(customer.oneOffBalance)} />
          <Detail label="Subscription wallet" value={money(customer.subscriptionBalance)} />
          <Detail label="Total paid" value={money(customer.totalSpend)} />
        </section>
        <section className="mt-5 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900">Recent orders</h4>
            <span className="text-sm text-slate-500">
              {customer.orderCount} total · latest {customer.orders.length}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {customer.orders.length === 0 ? (
              <p className="text-sm text-slate-500">No orders recorded.</p>
            ) : (
              customer.orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{order.id}</p>
                    <p className="text-xs capitalize text-slate-500">
                      {order.status.replaceAll('_', ' ')} · {date(order.createdAt)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{order.amount === null ? 'No invoice' : money(order.amount)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function UserFilterDrawer({
  isOpen,
  onClose,
  onApply,
  onClear,
  roleFilter,
  setRoleFilter,
  subscriptionFilter,
  setSubscriptionFilter,
  subscriptionPlans,
  dateMode,
  setDateMode,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: {
  isOpen: boolean
  onClose: () => void
  onApply: () => void
  onClear: () => void
  roleFilter: string
  setRoleFilter: (value: string) => void
  subscriptionFilter: string
  setSubscriptionFilter: (value: string) => void
  subscriptionPlans: Array<{ id: string; name: string; type: string }>
  dateMode: UsersData['dateMode']
  setDateMode: (value: UsersData['dateMode']) => void
  startDate: string
  setStartDate: (value: string) => void
  endDate: string
  setEndDate: (value: string) => void
}) {
  if (!isOpen) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/35" role="presentation" onMouseDown={onClose}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          aria-label="Close user filters"
          className="absolute top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-900"
          style={{ right: 'min(572px, calc(100vw - 36px))' }}
        >
          <X size={17} />
        </button>
      </div>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-filter-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="fixed inset-y-0 right-0 z-50 flex w-[calc(100vw-48px)] max-w-[560px] flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
      >
        <header className="border-b border-slate-100 px-6 py-5 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <h2 id="user-filter-title" className="text-xl font-bold text-slate-900">
              Filter users
            </h2>
            <button
              type="button"
              onClick={onClear}
              className="whitespace-nowrap text-sm font-semibold text-brand-primary hover:text-brand-primary-hover"
            >
              Clear filters
            </button>
          </div>
        </header>
        <div className="flex min-h-[calc(100vh-81px)] flex-1 flex-col px-6 py-6 sm:px-8">
          <div className="space-y-6">
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-slate-500">Role</span>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              >
                <option value="all">All roles</option>
                <option value="customer">Customer</option>
                <option value="vendor">Vendor</option>
                <option value="logistics">Logistics</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-slate-500">Subscription</span>
              <select
                value={subscriptionFilter}
                onChange={(event) => setSubscriptionFilter(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              >
                <option value="all">All users</option>
                <option value="active">All subscriptions</option>
                {subscriptionPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}({plan.type === 'semester' ? 'Semester' : 'Monthly'})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-slate-500">Joined date</span>
              <select
                value={dateMode}
                onChange={(event) => setDateMode(event.target.value as typeof dateMode)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              >
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="this_month">This month</option>
                <option value="last_month">Last month</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {dateMode === 'custom' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2.5 block text-xs font-semibold text-slate-500">From</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
                  />
                </label>
                <label className="block">
                  <span className="mb-2.5 block text-xs font-semibold text-slate-500">To</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
                  />
                </label>
              </div>
            )}
          </div>
          <div className="sticky bottom-0 mt-auto flex gap-3 border-t border-slate-100 bg-white pt-6">
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              className="h-11 flex-1 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover"
            >
              Apply filters
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

export default function Users() {
  const {
    customers,
    page,
    pageSize,
    total,
    query,
    roleFilter,
    subscriptionFilter,
    subscriptionPlans,
    activeSubscribers,
    dateMode,
    sortRules,
    startDate,
    endDate,
  } = useLoaderData<typeof loader>()
  const location = useLocation()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [draftRoleFilter, setDraftRoleFilter] = useState(roleFilter)
  const [draftSubscriptionFilter, setDraftSubscriptionFilter] = useState(subscriptionFilter)
  const [draftDateMode, setDraftDateMode] = useState(dateMode)
  const [draftStartDate, setDraftStartDate] = useState(startDate)
  const [draftEndDate, setDraftEndDate] = useState(endDate)
  const isLoadingPage = navigation.state === 'loading' && navigation.location?.pathname === '/admin/users'
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const buildSearch = (values: {
    page: number
    query?: string
    roleFilter?: string
    subscriptionFilter?: string
    sortRules?: UserSortRule[]
    dateMode?: UsersData['dateMode']
    startDate?: string
    endDate?: string
  }) => {
    const search = new URLSearchParams()
    if (values.page > 1) search.set('page', String(values.page))
    if (values.query) search.set('q', values.query)
    if (values.roleFilter && values.roleFilter !== 'all') search.set('role', values.roleFilter)
    if (values.subscriptionFilter && values.subscriptionFilter !== 'all') search.set('subscription', values.subscriptionFilter)
    if (values.sortRules) {
      if (values.sortRules.length === 0) search.set('sort', '')
      else if (values.sortRules.length !== 1 || values.sortRules[0].column !== 'joined' || values.sortRules[0].direction !== 'desc') {
        search.set('sort', values.sortRules.map((rule) => `${rule.column}:${rule.direction}`).join(','))
      }
    }
    if (values.dateMode && values.dateMode !== 'all') search.set('date', values.dateMode)
    if (values.startDate) search.set('from', values.startDate)
    if (values.endDate) search.set('to', values.endDate)
    return `?${search.toString()}`
  }
  const updateFilters = (filters: {
    roleFilter?: string
    subscriptionFilter?: string
    dateMode?: UsersData['dateMode']
    startDate?: string
    endDate?: string
  }) => {
    navigate(
      buildSearch({
        page: 1,
        query,
        roleFilter: filters.roleFilter ?? roleFilter,
        subscriptionFilter: filters.subscriptionFilter ?? subscriptionFilter,
        sortRules,
        dateMode: filters.dateMode ?? dateMode,
        startDate: filters.startDate ?? startDate,
        endDate: filters.endDate ?? endDate,
      }),
    )
  }
  const changeColumnSort = (column: UserSortColumn, direction: UserSortRule['direction']) => {
    const updatedRules = [{ column, direction }, ...sortRules.filter((rule) => rule.column !== column)]
    navigate(buildSearch({ page: 1, query, roleFilter, subscriptionFilter, sortRules: updatedRules, dateMode, startDate, endDate }))
  }
  const csvExportParams = new URLSearchParams(location.search)
  csvExportParams.delete('page')
  csvExportParams.set('export', 'csv')
  const csvExportUrl = `/admin/users/export?${csvExportParams.toString()}`
  const openFilterDrawer = () => {
    setDraftRoleFilter(roleFilter)
    setDraftSubscriptionFilter(subscriptionFilter)
    setDraftDateMode(dateMode)
    setDraftStartDate(startDate)
    setDraftEndDate(endDate)
    setIsFilterOpen(true)
  }
  const updateDraftDateMode = (value: UsersData['dateMode']) => {
    setDraftDateMode(value)
    const today = new Date()
    if (value === 'today') {
      const todayDate = inputDate(today)
      setDraftStartDate(todayDate)
      setDraftEndDate(todayDate)
    } else if (value === 'this_month') {
      setDraftStartDate(inputDate(new Date(today.getFullYear(), today.getMonth(), 1)))
      setDraftEndDate(inputDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)))
    } else if (value === 'last_month') {
      setDraftStartDate(inputDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)))
      setDraftEndDate(inputDate(new Date(today.getFullYear(), today.getMonth(), 0)))
    } else if (value === 'all' || value === 'custom') {
      setDraftStartDate('')
      setDraftEndDate('')
    }
  }
  const applyDraftFilters = () => {
    updateFilters({
      roleFilter: draftRoleFilter,
      subscriptionFilter: draftSubscriptionFilter,
      dateMode: draftDateMode,
      startDate: draftStartDate,
      endDate: draftEndDate,
    })
    setIsFilterOpen(false)
  }
  const clearDraftFilters = () => {
    setDraftRoleFilter('all')
    setDraftSubscriptionFilter('all')
    setDraftDateMode('all')
    setDraftStartDate('')
    setDraftEndDate('')
  }
  const applySortRules = (rules: UserSortRule[]) => {
    navigate(
      buildSearch({
        page: 1,
        query,
        roleFilter,
        subscriptionFilter,
        sortRules: rules,
        dateMode,
        startDate,
        endDate,
      }),
    )
  }
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4">
          <div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <p className="text-slate-500">{total.toLocaleString()} matching registered customers</p>
              <Link
                to="/admin/users?subscription=active"
                className="font-semibold text-brand-primary hover:text-brand-primary-hover"
              >
                {activeSubscribers.toLocaleString()} active subscribers
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Form method="get" className="relative w-full lg:max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="hidden" name="role" value={roleFilter} />
              <input type="hidden" name="subscription" value={subscriptionFilter} />
              <input type="hidden" name="sort" value={sortRules.map((rule) => `${rule.column}:${rule.direction}`).join(',')} />
              <input type="hidden" name="date" value={dateMode} />
              <input type="hidden" name="from" value={startDate} />
              <input type="hidden" name="to" value={endDate} />
              <input
                key={query}
                name="q"
                defaultValue={query}
                placeholder="Search name, email, phone, or Qaffy ID"
                aria-label="Search users"
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              />
            </Form>
            <div className="flex items-center gap-2 self-end lg:self-auto">
              <MultiSortManager columns={sortableColumns} rules={sortRules} onApply={applySortRules} />
              <button
                type="button"
                onClick={openFilterDrawer}
                aria-label="Open user filters"
                title="Filter users"
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-brand-primary hover:text-brand-primary"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {(roleFilter !== 'all' || subscriptionFilter !== 'all' || dateMode !== 'all') && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-primary" aria-label="Filters active" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = csvExportUrl
                  link.download = 'qaffy-admin-users.csv'
                  link.click()
                }}
                disabled={total === 0 || navigation.state !== 'idle'}
                title={navigation.state !== 'idle' ? 'Wait for the current filters to finish applying.' : `Export all ${total} filtered customers`}
                className="h-10 rounded-full bg-brand-primary px-5 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1360px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] capitalize tracking-[0.12em] text-slate-500">
                {(
                  [
                    ['name', 'Customer'],
                    ['joined', 'Joined'],
                    ['role', 'Role'],
                    ['email', 'Email'],
                    ['phone', 'Phone'],
                    ['orders', 'Orders'],
                    ['total_paid', 'Total paid'],
                    ['wallet', 'Wallet'],
                    ['plan', 'Plan'],
                  ] as const
                ).map(([column, label]) => {
                  const activeRule = sortRules.find((rule) => rule.column === column)
                  return (
                    <th key={column} className={`${column === 'total_paid' ? 'min-w-[160px]' : ''} px-5 py-3 font-semibold`}>
                      <SortColumnHeader
                        label={label}
                        direction={activeRule?.direction ?? null}
                        onSort={(direction) => changeColumnSort(column, direction)}
                        fillWidth={column === 'total_paid'}
                      />
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {isLoadingPage ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12">
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500" role="status">
                      <LoaderCircle size={18} className="animate-spin text-brand-primary" />
                      Loading customers…
                    </div>
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr
                    key={customer.id}
                    tabIndex={0}
                    onClick={() => navigate(`/admin/users/${customer.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') navigate(`/admin/users/${customer.id}`)
                    }}
                    className="cursor-pointer border-b border-slate-100 transition hover:bg-brand-soft/40 last:border-0"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
                          <UserRound size={16} />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{customer.name}</p>
                          <p className="text-xs text-slate-500">{customer.qaffyId ?? 'Qaffy ID unavailable'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{date(customer.joinedAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex max-w-36 flex-wrap gap-1">
                        {customer.roles.map((role) => (
                          <span
                            key={role}
                            className="rounded-full bg-brand-soft px-2 py-1 text-[10px] font-semibold capitalize text-brand-primary"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                      <CopyValue value={customer.email} label="email" />
                    </td>
                    <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                      <CopyValue value={customer.phone} label="phone number" />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-700">
                      {customer.orderCount}
                      <p className="text-xs font-normal text-slate-400">Last: {date(customer.lastOrder)}</p>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-700">{money(customer.totalSpend)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{money(customer.oneOffBalance + customer.subscriptionBalance)}</td>
                    <td className="min-w-max whitespace-nowrap px-5 py-4 text-sm text-slate-600">{customer.activePlan ?? 'One-time'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {!isLoadingPage && customers.length === 0 && <p className="p-10 text-center text-sm text-slate-500">No matching customers.</p>}
        </div>
        {total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()} customers
            </p>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  navigate(buildSearch({ page: page - 1, query, roleFilter, subscriptionFilter, sortRules, dateMode, startDate, endDate }))
                }
                disabled={page === 1 || isLoadingPage}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span className="whitespace-nowrap text-sm text-slate-600">
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() =>
                  navigate(buildSearch({ page: page + 1, query, roleFilter, subscriptionFilter, sortRules, dateMode, startDate, endDate }))
                }
                disabled={page === pageCount || isLoadingPage}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
      <UserFilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={applyDraftFilters}
        onClear={clearDraftFilters}
        roleFilter={draftRoleFilter}
        setRoleFilter={setDraftRoleFilter}
        subscriptionFilter={draftSubscriptionFilter}
        setSubscriptionFilter={setDraftSubscriptionFilter}
        subscriptionPlans={subscriptionPlans}
        dateMode={draftDateMode}
        setDateMode={updateDraftDateMode}
        startDate={draftStartDate}
        setStartDate={(value) => {
          setDraftDateMode('custom')
          setDraftStartDate(value)
        }}
        endDate={draftEndDate}
        setEndDate={(value) => {
          setDraftDateMode('custom')
          setDraftEndDate(value)
        }}
      />
    </div>
  )
}
