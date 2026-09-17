import { ArrowLeft, Copy, Save, WalletCards } from "lucide-react";
import {
  data,
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useState } from "react";
import type { Route } from "./+types/UserDetails";
import { requireRole } from "../../../lib/auth.server";
import { adjustWallet } from "../../../lib/wallet.server";
import { toast } from "../../../lib/toast";

type DetailOrder = {
  id: string;
  status: string;
  createdAt: string;
  customerCount: number;
  vendorCount: number | null;
  invoiceAmount: number | null;
  invoiceStatus: string | null;
};
type DetailSubscription = {
  id: string;
  planName: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string | null;
};
type DetailPayment = {
  id: string;
  provider: string;
  reference: string;
  amount: number;
  status: string;
  createdAt: string;
};
type DetailTransaction = {
  id: string;
  balanceType: string;
  txnType: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
};
type DetailReferral = {
  id: string;
  referredId: string;
  status: string;
  rewardType: string | null;
  rewardValue: number | null;
  createdAt: string;
};
type UserDetailsData = {
  profile: {
    id: string;
    qaffyId: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    createdAt: string;
  };
  roles: string[];
  stats: {
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    totalSpent: number;
    activeSubscriptions: number;
  };
  wallet: { oneOff: number; subscription: number };
  orders: DetailOrder[];
  subscriptions: DetailSubscription[];
  payments: DetailPayment[];
  transactions: DetailTransaction[];
  referrals: DetailReferral[];
  plans: Array<{
    id: string;
    name: string;
    type: string;
    semesterEndDate: string | null;
    active: boolean;
  }>;
};

function money(value: number) {
  return `\u20A6${value.toLocaleString()}`;
}
function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}
function dateInput(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function addMonth(value: string) {
  const start = new Date(`${value}T12:00:00`);
  return dateInput(
    new Date(start.getFullYear(), start.getMonth() + 1, start.getDate()),
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await requireRole(request, "admin");
  const customerId = params.id;
  if (!auth || !customerId)
    return data<UserDetailsData | null>(null, { status: 404 });
  const { supabase, headers } = auth;
  const [
    { data: profile },
    { data: roles },
    { data: wallet },
    { data: orders },
    { data: invoices },
    { data: subscriptions },
    { data: plans },
    { data: payments },
    { data: transactions },
    { data: referrals },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, qaffy_id, name, email, phone, created_at")
      .eq("id", customerId)
      .maybeSingle(),
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", customerId)
      .eq("status", "approved"),
    supabase
      .from("wallets")
      .select("one_off_balance, subscription_balance")
      .eq("customer_id", customerId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select(
        "id, status, clothes_count_customer, clothes_count_vendor, created_at",
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("order_id, amount, status")
      .in(
        "order_id",
        (
          await supabase
            .from("orders")
            .select("id")
            .eq("customer_id", customerId)
        ).data?.map((order) => order.id) ?? [],
      ),
    supabase
      .from("subscriptions")
      .select("id, plan_id, status, start_date, end_date")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("plans")
      .select("id, name, type, semester_end_date, active")
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("id, provider, reference, amount, status, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("wallet_transactions")
      .select("id, balance_type, txn_type, amount, balance_after, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("referrals")
      .select("id, referred_id, status, reward_type, reward_value, created_at")
      .eq("referrer_id", customerId)
      .order("created_at", { ascending: false }),
  ]);
  if (!profile)
    return data<UserDetailsData | null>(null, { headers, status: 404 });
  const planById = new Map((plans ?? []).map((plan) => [plan.id, plan]));
  const invoiceByOrder = new Map(
    (invoices ?? []).map((invoice) => [invoice.order_id, invoice]),
  );
  const stats = {
    totalOrders: orders?.length ?? 0,
    completedOrders: (orders ?? []).filter(
      (order) => order.status === "delivered",
    ).length,
    cancelledOrders: (orders ?? []).filter(
      (order) => order.status === "cancelled",
    ).length,
    totalSpent: (invoices ?? [])
      .filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => sum + Number(invoice.amount), 0),
    activeSubscriptions: (subscriptions ?? []).filter(
      (subscription) => subscription.status === "active",
    ).length,
  };
  return data<UserDetailsData>(
    {
      profile: {
        id: profile.id,
        qaffyId: profile.qaffy_id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        createdAt: profile.created_at,
      },
      roles: (roles ?? []).map((role) => role.role),
      stats,
      wallet: {
        oneOff: Number(wallet?.one_off_balance ?? 0),
        subscription: Number(wallet?.subscription_balance ?? 0),
      },
      orders: (orders ?? []).map((order) => ({
        id: order.id,
        status: order.status,
        createdAt: order.created_at,
        customerCount: order.clothes_count_customer,
        vendorCount: order.clothes_count_vendor,
        invoiceAmount: invoiceByOrder.get(order.id)
          ? Number(invoiceByOrder.get(order.id)?.amount)
          : null,
        invoiceStatus: invoiceByOrder.get(order.id)?.status ?? null,
      })),
      subscriptions: (subscriptions ?? []).map((subscription) => ({
        id: subscription.id,
        planName: planById.get(subscription.plan_id)?.name ?? "Unknown plan",
        type: planById.get(subscription.plan_id)?.type ?? "unknown",
        status: subscription.status,
        startDate: subscription.start_date,
        endDate: subscription.end_date,
      })),
      payments: (payments ?? []).map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        reference: payment.reference,
        amount: Number(payment.amount),
        status: payment.status,
        createdAt: payment.created_at,
      })),
      transactions: (transactions ?? []).map((transaction) => ({
        id: transaction.id,
        balanceType: transaction.balance_type,
        txnType: transaction.txn_type,
        amount: Number(transaction.amount),
        balanceAfter: Number(transaction.balance_after),
        createdAt: transaction.created_at,
      })),
      referrals: (referrals ?? []).map((referral) => ({
        id: referral.id,
        referredId: referral.referred_id,
        status: referral.status,
        rewardType: referral.reward_type,
        rewardValue:
          referral.reward_value === null ? null : Number(referral.reward_value),
        createdAt: referral.created_at,
      })),
      plans: (plans ?? []).map((plan) => ({
        id: plan.id,
        name: plan.name,
        type: plan.type,
        semesterEndDate: plan.semester_end_date,
        active: plan.active,
      })),
    },
    { headers, status: 200 },
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request, params }: Route.ActionArgs) {
  const auth = await requireRole(request, "admin");
  const customerId = params.id;
  if (!auth || !customerId)
    return data(
      { ok: false, message: "Admin access required." },
      { status: 403 },
    );
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  if (intent === "profile") {
    const { error } = await auth.supabase
      .from("profiles")
      .update({
        name: String(formData.get("name") ?? "").trim() || null,
        email: String(formData.get("email") ?? "").trim() || null,
        phone: String(formData.get("phone") ?? "").trim() || null,
      })
      .eq("id", customerId);
    return error
      ? data({ ok: false, message: error.message }, { status: 400 })
      : data({ ok: true, message: "Profile updated." });
  }
  if (intent === "wallet") {
    try {
      const amount = Number(formData.get("amount"));
      if (!Number.isInteger(amount))
        return data(
          { ok: false, message: "Wallet adjustments must use whole numbers." },
          { status: 400 },
        );
      const result = await adjustWallet(customerId, "one_off", amount);
      return data({
        ok: true,
        message: `${result.balanceType} wallet adjusted by ${money(result.amount)}.`,
      });
    } catch (error) {
      return data(
        {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Wallet adjustment failed.",
        },
        { status: 400 },
      );
    }
  }
  if (intent === "subscription") {
    const planId = String(formData.get("planId") ?? "");
    const startDate = String(
      formData.get("startDate") ?? new Date().toISOString().slice(0, 10),
    );
    const endDate = String(formData.get("endDate") ?? "") || null;
    if (!planId)
      return data({ ok: false, message: "Select a plan." }, { status: 400 });
    const { data: existing } = await auth.supabase
      .from("subscriptions")
      .select("id")
      .eq("customer_id", customerId)
      .eq("status", "active")
      .maybeSingle();
    if (existing)
      return data(
        { ok: false, message: "Customer already has an active subscription." },
        { status: 409 },
      );
    const { error } = await auth.supabase
      .from("subscriptions")
      .insert({
        customer_id: customerId,
        plan_id: planId,
        status: "active",
        start_date: startDate,
        end_date: endDate,
      });
    return error
      ? data({ ok: false, message: error.message }, { status: 400 })
      : data({ ok: true, message: "Subscription created." });
  }
  return data({ ok: false, message: "Unknown action." }, { status: 400 });
}

function CopyField({ label, value }: { label: string; value: string | null }) {
  const copy = async () => {
    if (value && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    }
  };
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          name={label.toLowerCase()}
          defaultValue={value ?? ""}
          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
        />
        {value && (
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={`Copy ${label}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-brand-primary hover:text-brand-primary"
          >
            <Copy size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function UserStats({ stats }: { stats: UserDetailsData["stats"] }) {
  const cards = [
    ["Total orders", stats.totalOrders],
    ["Completed", stats.completedOrders],
    /* ['Cancelled', stats.cancelledOrders], */ [
      "Total spent",
      money(stats.totalSpent),
    ],
    ["Active subscriptions", stats.activeSubscriptions],
  ] as const;
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map(([label, value]) => (
        <div
          key={label}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
        </div>
      ))}
    </section>
  );
}

function ManualSubscription({
  plans,
  isSaving,
}: {
  plans: UserDetailsData["plans"];
  isSaving: boolean;
}) {
  const today = dateInput(new Date());
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const updatePlanDates = (nextPlanId: string, nextStartDate = startDate) => {
    const plan = plans.find((candidate) => candidate.id === nextPlanId);
    setPlanId(nextPlanId);
    if (!plan) {
      setEndDate("");
      return;
    }
    setEndDate(
      plan.type === "semester"
        ? (plan.semesterEndDate ?? "")
        : addMonth(nextStartDate),
    );
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-bold text-slate-900">Manual subscription</h3>
      <Form method="post" className="mt-4 space-y-3">
        <input type="hidden" name="intent" value="subscription" />
        <select
          name="planId"
          value={planId}
          onChange={(event) => updatePlanDates(event.target.value)}
          required
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="">Select active plan</option>
          {plans
            .filter((plan) => plan.active)
            .map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} | {plan.type}
              </option>
            ))}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <input
            name="startDate"
            type="date"
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              if (plans.find((plan) => plan.id === planId)?.type === "monthly")
                setEndDate(addMonth(event.target.value));
            }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
          />
          <input
            name="endDate"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Create subscription
        </button>
      </Form>
    </div>
  );
}

export default function UserDetails() {
  const details = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  if (!details)
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        Customer not found.
      </div>
    );
  const isSaving = navigation.state !== "idle";
  return (
    <div className="space-y-6">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand-primary"
      >
        <ArrowLeft size={15} />
        Back to users
      </Link>
      <header>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          {details.profile.name ?? "Unnamed customer"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {details.profile.qaffyId ?? "Qaffy ID unavailable"} || Joined{" "}
          {date(details.profile.createdAt)}
        </p>
      </header>
      <UserStats stats={details.stats} />
      {actionData?.message && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${actionData.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
        >
          {actionData.message}
        </p>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Save size={17} className="text-brand-primary" />
          <h3 className="font-bold text-slate-900">Profile and contact</h3>
        </div>
        <Form method="post" className="grid gap-4 md:grid-cols-3">
          <input type="hidden" name="intent" value="profile" />
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Name
            </label>
            <input
              name="name"
              defaultValue={details.profile.name ?? ""}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-focus"
            />
          </div>
          <CopyField label="Email" value={details.profile.email} />
          <CopyField label="Phone" value={details.profile.phone} />
          <div className="md:col-span-3">
            <p className="text-xs text-slate-500">
              Roles:{" "}
              <strong className="capitalize text-slate-700">
                {details.roles.join(", ") || "customer"}
              </strong>
            </p>
            <button
              type="submit"
              disabled={isSaving}
              className="mt-4 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-primary-hover disabled:opacity-50"
            >
              Save profile
            </button>
          </div>
        </Form>
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-brand-border bg-brand-soft p-5">
          <div className="mb-4 flex items-center gap-2">
            <WalletCards size={17} className="text-brand-primary" />
            <h3 className="font-bold text-slate-900">Wallet balances</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">One-off</p>
              <strong>{money(details.wallet.oneOff)}</strong>
            </div>
            <div>
              <p className="text-xs text-slate-500">Subscription</p>
              <strong>{money(details.wallet.subscription)}</strong>
            </div>
          </div>
          <Form method="post" className="mt-5 space-y-3">
            <input type="hidden" name="intent" value="wallet" />
            <input type="hidden" name="balanceType" value="one_off" />
            <input
              name="amount"
              type="number"
              step="1"
              inputMode="numeric"
              placeholder="+ or - whole amount"
              required
              className="h-10 w-full rounded-lg border border-brand-border bg-white px-3 text-sm outline-none focus:border-brand-primary"
            />
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Adjust wallet
            </button>
          </Form>
        </div>
        <ManualSubscription plans={details.plans} isSaving={isSaving} />
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Subscriptions</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="pb-3">Plan</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Start</th>
                <th className="pb-3">End</th>
              </tr>
            </thead>
            <tbody>
              {details.subscriptions.map((subscription) => (
                <tr key={subscription.id} className="border-t border-slate-100">
                  <td className="py-3 font-semibold">
                    {subscription.planName} | {subscription.type}
                  </td>
                  <td className="py-3 capitalize">{subscription.status}</td>
                  <td className="py-3">{subscription.startDate}</td>
                  <td className="py-3">
                    {subscription.endDate ?? "Open ended"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {details.subscriptions.length === 0 && (
            <p className="text-sm text-slate-500">No subscriptions recorded.</p>
          )}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Orders and invoices</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="pb-3">Order</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Items</th>
                <th className="pb-3">Invoice</th>
                <th className="pb-3">Payment</th>
                <th className="pb-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {details.orders.map((order) => (
                <tr key={order.id} className="border-t border-slate-100">
                  <td className="py-3 font-semibold">{order.id}</td>
                  <td className="py-3 capitalize">
                    {order.status.replaceAll("_", " ")}
                  </td>
                  <td className="py-3">
                    {order.customerCount} /{" "}
                    {order.vendorCount ?? "Not confirmed"}
                  </td>
                  <td className="py-3">
                    {order.invoiceAmount === null
                      ? "Not created"
                      : money(order.invoiceAmount)}
                  </td>
                  <td className="py-3 capitalize">
                    {order.invoiceStatus ?? "Pending"}
                  </td>
                  <td className="py-3">{date(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {details.orders.length === 0 && (
            <p className="text-sm text-slate-500">No orders recorded.</p>
          )}
        </div>
      </section>
      <section className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-slate-900">Payments</h3>
          <div className="mt-4 space-y-2">
            {details.payments.length === 0 ? (
              <p className="text-sm text-slate-500">No payments recorded.</p>
            ) : (
              details.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm"
                >
                  <span>
                    {payment.provider} | {payment.reference}
                  </span>
                  <strong>
                    {money(payment.amount)} | {payment.status}
                  </strong>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-slate-900">Wallet ledger</h3>
          <div className="mt-4 space-y-2">
            {details.transactions.length === 0 ? (
              <p className="text-sm text-slate-500">
                No wallet transactions recorded.
              </p>
            ) : (
              details.transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm"
                >
                  <span className="capitalize">
                    {transaction.txnType} | {transaction.balanceType}
                  </span>
                  <strong>
                    {money(transaction.amount)} |{" "}
                    {money(transaction.balanceAfter)}
                  </strong>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-slate-900">Referrals</h3>
          <div className="mt-4 space-y-2">
            {details.referrals.length === 0 ? (
              <p className="text-sm text-slate-500">No referrals recorded.</p>
            ) : (
              details.referrals.map((referral) => (
                <div
                  key={referral.id}
                  className="border-b border-slate-100 pb-2 text-sm"
                >
                  <p className="font-semibold">{referral.referredId}</p>
                  <p className="capitalize text-slate-500">
                    {referral.status}
                    {referral.rewardValue === null
                      ? ""
                      : ` | ${money(referral.rewardValue)}`}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
