import { Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { data, useLoaderData, useNavigate } from "react-router";
import { useMemo, useState } from "react";
import type { Route } from "./+types/Users";
import { requireRole } from "../../../lib/auth.server";
import { toast } from "../../../lib/toast";

type CustomerOrder = {
  id: string;
  status: string;
  createdAt: string;
  amount: number | null;
  invoiceStatus: string | null;
};
type Customer = {
  id: string;
  qaffyId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  joinedAt: string;
  orderCount: number;
  totalSpend: number;
  lastOrder: string | null;
  oneOffBalance: number;
  subscriptionBalance: number;
  activePlan: string | null;
  orders: CustomerOrder[];
};
type UsersData = { customers: Customer[] };

function money(value: number) {
  return `₦${value.toLocaleString()}`;
}
function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Not recorded";
}
const csvValue = (value: string | number | null) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;
const csvText = (value: string | null) =>
  `="${String(value ?? "").replace(/"/g, '""')}"`;
const inputDate = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireRole(request, "admin");
  if (!auth) return data<UsersData>({ customers: [] }, { status: 200 });
  const { supabase, headers } = auth;
  const [
    { data: profiles },
    { data: orders },
    { data: invoices },
    { data: wallets },
    { data: subscriptions },
    { data: plans },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, qaffy_id, name, email, phone, created_at")
      .eq("role", "customer")
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("id, customer_id, status, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("invoices").select("order_id, amount, status"),
    supabase
      .from("wallets")
      .select("customer_id, one_off_balance, subscription_balance"),
    supabase
      .from("subscriptions")
      .select("customer_id, plan_id, status, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase.from("plans").select("id, name"),
  ]);
  const invoiceByOrder = new Map(
    (invoices ?? []).map((invoice) => [invoice.order_id, invoice]),
  );
  const walletByCustomer = new Map(
    (wallets ?? []).map((wallet) => [wallet.customer_id, wallet]),
  );
  const planById = new Map((plans ?? []).map((plan) => [plan.id, plan.name]));
  const subscriptionByCustomer = new Map<string, string>();
  for (const subscription of subscriptions ?? [])
    if (!subscriptionByCustomer.has(subscription.customer_id))
      subscriptionByCustomer.set(
        subscription.customer_id,
        planById.get(subscription.plan_id) ?? "Active plan",
      );
  const profileIds = (profiles ?? []).map((profile) => profile.id);
  const { data: roleRows } = profileIds.length
    ? await supabase
        .from("profile_roles")
        .select("profile_id, role")
        .in("profile_id", profileIds)
        .eq("status", "approved")
    : { data: [] };
  const rolesByCustomer = new Map<string, string[]>();
  for (const role of roleRows ?? [])
    rolesByCustomer.set(role.profile_id, [
      ...(rolesByCustomer.get(role.profile_id) ?? []),
      role.role,
    ]);
  return data<UsersData>(
    {
      customers: (profiles ?? []).map((profile) => {
        const customerOrders = (orders ?? []).filter(
          (order) => order.customer_id === profile.id,
        );
        const customerWallet = walletByCustomer.get(profile.id);
        const customerOrderDetails = customerOrders.map((order) => {
          const invoice = invoiceByOrder.get(order.id);
          return {
            id: order.id,
            status: order.status,
            createdAt: order.created_at,
            amount: invoice ? Number(invoice.amount) : null,
            invoiceStatus: invoice?.status ?? null,
          };
        });
        return {
          id: profile.id,
          qaffyId: profile.qaffy_id,
          name: profile.name ?? "Unnamed customer",
          email: profile.email,
          phone: profile.phone,
          roles: rolesByCustomer.get(profile.id) ?? ["customer"],
          joinedAt: profile.created_at,
          orderCount: customerOrders.length,
          totalSpend: customerOrderDetails.reduce(
            (sum, order) =>
              sum + (order.invoiceStatus === "paid" ? (order.amount ?? 0) : 0),
            0,
          ),
          lastOrder: customerOrders[0]?.created_at ?? null,
          oneOffBalance: Number(customerWallet?.one_off_balance ?? 0),
          subscriptionBalance: Number(
            customerWallet?.subscription_balance ?? 0,
          ),
          activePlan: subscriptionByCustomer.get(profile.id) ?? null,
          orders: customerOrderDetails,
        };
      }),
    },
    { headers, status: 200 },
  );
}

function CopyValue({ value, label }: { value: string | null; label: string }) {
  const copy = async () => {
    if (value && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      toast.success(`${label[0].toUpperCase()}${label.slice(1)} copied`);
    }
  };
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
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}

export function CustomerDetails({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-slate-950/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[calc(100vh-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary">
              Customer profile
            </p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">
              {customer.name}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {customer.qaffyId ?? "Qaffy ID unavailable"}
            </p>
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Email
            </p>
            <div className="mt-1">
              <CopyValue value={customer.email} label="email" />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Phone
            </p>
            <div className="mt-1">
              <CopyValue value={customer.phone} label="phone number" />
            </div>
          </div>
          <Detail label="Roles" value={customer.roles.join(", ")} />
          <Detail label="Joined" value={date(customer.joinedAt)} />
          <Detail
            label="Active plan"
            value={customer.activePlan ?? "One-time customer"}
          />
        </section>
        <section className="mt-5 grid gap-4 rounded-2xl border border-brand-border bg-brand-soft p-4 sm:grid-cols-3">
          <Detail
            label="One-off wallet"
            value={money(customer.oneOffBalance)}
          />
          <Detail
            label="Subscription wallet"
            value={money(customer.subscriptionBalance)}
          />
          <Detail label="Total paid" value={money(customer.totalSpend)} />
        </section>
        <section className="mt-5 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900">Order history</h4>
            <span className="text-sm text-slate-500">
              {customer.orderCount} orders
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {customer.orders.length === 0 ? (
              <p className="text-sm text-slate-500">No orders recorded.</p>
            ) : (
              customer.orders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {order.id}
                    </p>
                    <p className="text-xs capitalize text-slate-500">
                      {order.status.replaceAll("_", " ")} ·{" "}
                      {date(order.createdAt)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    {order.amount === null ? "No invoice" : money(order.amount)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function UserFilterDrawer({
  isOpen,
  onClose,
  roleFilter,
  setRoleFilter,
  dateMode,
  setDateMode,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: {
  isOpen: boolean;
  onClose: () => void;
  roleFilter: string;
  setRoleFilter: (value: string) => void;
  dateMode: "all" | "this_month" | "last_month" | "custom";
  setDateMode: (value: "all" | "this_month" | "last_month" | "custom") => void;
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
}) {
  if (!isOpen) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-950/35"
        role="presentation"
        onMouseDown={onClose}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          aria-label="Close user filters"
          className="absolute top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-900"
          style={{ right: "min(572px, calc(100vw - 36px))" }}
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
          <h2 id="user-filter-title" className="text-xl font-bold text-slate-900">
            Filter users
          </h2>
        </header>
        <div className="flex min-h-[calc(100vh-81px)] flex-1 flex-col px-6 py-6 sm:px-8">
          <div className="space-y-6">
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-slate-500">
                Role
              </span>
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
              <span className="mb-2.5 block text-xs font-semibold text-slate-500">
                Joined date
              </span>
              <select
                value={dateMode}
                onChange={(event) =>
                  setDateMode(event.target.value as typeof dateMode)
                }
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              >
                <option value="all">All time</option>
                <option value="this_month">This month</option>
                <option value="last_month">Last month</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {dateMode === "custom" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2.5 block text-xs font-semibold text-slate-500">
                    From
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
                  />
                </label>
                <label className="block">
                  <span className="mb-2.5 block text-xs font-semibold text-slate-500">
                    To
                  </span>
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
              onClick={onClose}
              className="h-11 flex-1 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover"
            >
              Apply filters
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default function Users() {
  const { customers } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateMode, setDateMode] = useState<
    "all" | "this_month" | "last_month" | "custom"
  >("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const dateRange = useMemo(() => {
    if (dateMode === "custom") return { start: startDate, end: endDate };
    if (dateMode === "all") return { start: "", end: "" };
    const today = new Date();
    return dateMode === "this_month"
      ? {
          start: inputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
          end: inputDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
        }
      : {
          start: inputDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
          end: inputDate(new Date(today.getFullYear(), today.getMonth(), 0)),
        };
  }, [dateMode, endDate, startDate]);
  const filteredCustomers = useMemo(
    () => customers.filter((customer) => {
      const text = `${customer.name} ${customer.email ?? ""} ${customer.phone ?? ""} ${customer.qaffyId ?? ""}`.toLowerCase();
      const joinedDate = customer.joinedAt.slice(0, 10);
      return text.includes(query.toLowerCase())
        && (roleFilter === "all" || customer.roles.includes(roleFilter))
        && (!dateRange.start || joinedDate >= dateRange.start)
        && (!dateRange.end || joinedDate <= dateRange.end);
    }),
    [customers, dateRange, query, roleFilter],
  );
  const exportCsv = () => {
    const header = ["Name", "Qaffy ID", "Roles", "Email", "Phone", "Joined", "Orders", "Total paid", "Wallet", "Plan"];
    const lines = filteredCustomers.map((customer) => [
      csvValue(customer.name),
      csvValue(customer.qaffyId),
      csvValue(customer.roles.join(", ")),
      csvValue(customer.email),
      csvText(customer.phone),
      csvValue(date(customer.joinedAt)),
      csvValue(customer.orderCount),
      csvValue(customer.totalSpend),
      csvValue(customer.oneOffBalance + customer.subscriptionBalance),
      csvValue(customer.activePlan ?? "One-time"),
    ].join(","));
    const blob = new Blob([[header.map(csvValue).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "qaffy-admin-users.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4">
          <div>
            <p className="text-sm text-slate-500">
              {filteredCustomers.length} of {customers.length} registered customers
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email, phone, or Qaffy ID"
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
              />
            </div>
            <div className="flex items-center gap-2 self-end lg:self-auto">
              <button
                type="button"
                onClick={() => setIsFilterOpen(true)}
                aria-label="Open user filters"
                title="Filter users"
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-brand-primary hover:text-brand-primary"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {(roleFilter !== "all" || dateMode !== "all") && (
                  <span
                    className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-primary"
                    aria-label="Filters active"
                  />
                )}
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={filteredCustomers.length === 0}
                className="h-10 rounded-full bg-brand-primary px-5 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Phone</th>
                <th className="px-5 py-3 font-semibold">Orders</th>
                <th className="px-5 py-3 font-semibold">Total paid</th>
                <th className="px-5 py-3 font-semibold">Wallet</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  tabIndex={0}
                  onClick={() => navigate(`/admin/users/${customer.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      navigate(`/admin/users/${customer.id}`);
                  }}
                  className="cursor-pointer border-b border-slate-100 transition hover:bg-brand-soft/40 last:border-0"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
                        <UserRound size={16} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {customer.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {customer.qaffyId ?? "Qaffy ID unavailable"}
                        </p>
                      </div>
                    </div>
                  </td>
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
                  <td
                    className="px-5 py-4"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <CopyValue value={customer.email} label="email" />
                  </td>
                  <td
                    className="px-5 py-4"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <CopyValue value={customer.phone} label="phone number" />
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                    {customer.orderCount}
                    <p className="text-xs font-normal text-slate-400">
                      Last: {date(customer.lastOrder)}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                    {money(customer.totalSpend)}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">
                    {money(
                      customer.oneOffBalance + customer.subscriptionBalance,
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">
                    {customer.activePlan ?? "One-time"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredCustomers.length === 0 && (
            <p className="p-10 text-center text-sm text-slate-500">
              No matching customers.
            </p>
          )}
        </div>
      </section>
      <UserFilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
        dateMode={dateMode}
        setDateMode={setDateMode}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
      />
    </div>
  );
}
