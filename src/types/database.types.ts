// Hand-written to match supabase/migrations/20260904120000_init_schema.sql.
// Once a Supabase project is linked, regenerate with:
//   supabase gen types typescript --linked > src/types/database.types.ts

export type UserRole = 'customer' | 'logistics' | 'vendor' | 'admin'
export type PartnerStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type PlanType = 'monthly' | 'semester'
export type SubscriptionStatus = 'active' | 'ended' | 'cancelled'
export type WalletBalanceType = 'one_off' | 'subscription'
export type WalletTxnType = 'topup' | 'debit' | 'refund' | 'adjustment'
export type OrderType = 'wash' | 'wash_iron' | 'mixed'
export type OrderStatus =
  | 'pending_pickup'
  | 'picked_up'
  | 'at_vendor'
  | 'invoiced'
  | 'paid'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
export type MismatchDirection = 'over' | 'under'
export type InvoiceStatus = 'unpaid' | 'paid'
export type PaymentStatus = 'pending' | 'success' | 'failed'
export type SettlementStatus = 'pending' | 'paid'
export type ReferralStatus = 'pending' | 'rewarded'
export type LogisticsEventType = 'picked_up' | 'delivered'

export interface Profile {
  id: string
  role: UserRole
  qaffy_id: string | null
  name: string | null
  phone: string | null
  pickup_location_id: string | null
  email: string | null
  referral_code: string | null
  referred_by: string | null
  created_at: string
}

export interface Vendor {
  id: string
  profile_id: string
  business_name: string
  status: PartnerStatus
  created_at: string
}

export interface LogisticsAgent {
  id: string
  profile_id: string
  status: PartnerStatus
  created_at: string
}

export interface ProfileRole {
  id: string
  profile_id: string
  role: Exclude<UserRole, 'customer'>
  status: PartnerStatus
  created_at: string
}

export interface ClothCategory {
  id: string
  name: string
  is_main: boolean
  active: boolean
  created_at: string
}

export interface ClothCategoryRate {
  id: string
  category_id: string
  wash_price: number
  iron_price: number
  wash_iron_price: number
  vendor_wash_price: number
  vendor_iron_price: number
  vendor_wash_iron_price: number
  subscription_units: number
  created_at: string
}

export interface PickupLocation {
  id: string
  name: string
  address: string | null
  active: boolean
  created_at: string
}

export interface AppSettings {
  id: string
  key: string
  semester_start_date: string | null
  semester_end_date: string | null
  updated_at: string
}

export interface Plan {
  id: string
  name: string
  type: PlanType
  weekly_limit: number
  price: number
  semester_start_date: string | null
  semester_end_date: string | null
  active: boolean
  created_at: string
}

export interface Subscription {
  id: string
  customer_id: string
  plan_id: string
  status: SubscriptionStatus
  start_date: string
  end_date: string | null
  created_at: string
}

export interface Wallet {
  customer_id: string
  one_off_balance: number
  subscription_balance: number
  updated_at: string
}

export interface WalletTransaction {
  id: string
  customer_id: string
  balance_type: WalletBalanceType
  txn_type: WalletTxnType
  amount: number
  balance_after: number
  related_invoice_id: string | null
  related_payment_id: string | null
  created_at: string
}

export interface Order {
  id: string
  public_order_number: string
  customer_id: string
  vendor_id: string | null
  order_type: OrderType
  clothes_count_customer: number
  clothes_count_customer_units: number | null
  clothes_count_vendor: number | null
  clothes_count_vendor_units: number | null
  subscription_units_applied: number | null
  status: OrderStatus
  pickup_otp: string | null
  delivery_otp: string | null
  pickup_location_id: string | null
  notes: string | null
  is_subscription_order: boolean
  billed_extra_amount: number | null
  picked: boolean
  picked_up_date: string | null
  created_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  category_id: string
  quantity: number
  confirmed_quantity: number | null
  service: 'wash' | 'iron' | 'wash_iron'
  unit_price: number
}

export interface Mismatch {
  id: string
  order_id: string
  direction: MismatchDirection
  detail: string | null
  details: Array<{
    category: string
    service: 'wash' | 'iron' | 'wash_iron'
    originalQuantity: number
    confirmedQuantity: number
    difference: number
    unitPrice: number
    extraAmount: number
  }>
  created_at: string
}

export interface Invoice {
  id: string
  order_id: string
  amount: number
  status: InvoiceStatus
  paid_at: string | null
  created_at: string
}

export interface Payment {
  id: string
  customer_id: string
  provider: string
  reference: string
  amount: number
  balance_type: WalletBalanceType
  plan_id: string | null
  status: PaymentStatus
  created_at: string
}

export interface VendorSettlement {
  id: string
  vendor_id: string
  period_start: string
  period_end: string
  amount_due: number
  status: SettlementStatus
  created_at: string
}

export interface VendorSettlementOrder {
  settlement_id: string
  order_id: string
}

export interface Referral {
  id: string
  referrer_id: string
  referred_id: string
  reward_type: string | null
  reward_value: number | null
  status: ReferralStatus
  created_at: string
}

export interface OrderLogisticsEvent {
  id: string
  order_id: string
  agent_profile_id: string | null
  event_type: LogisticsEventType
  created_at: string
}

export interface AdminAuditEvent {
  id: string
  admin_profile_id: string
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

type TableDef<Row> = {
  Row: Row & Record<string, unknown>
  Insert: Partial<Row> & Record<string, unknown>
  Update: Partial<Row> & Record<string, unknown>
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile>
      vendors: TableDef<Vendor>
      logistics_agents: TableDef<LogisticsAgent>
      profile_roles: TableDef<ProfileRole>
      cloth_categories: TableDef<ClothCategory>
      cloth_category_rates: TableDef<ClothCategoryRate>
      pickup_locations: TableDef<PickupLocation>
      plans: TableDef<Plan>
      subscriptions: TableDef<Subscription>
      wallets: TableDef<Wallet>
      wallet_transactions: TableDef<WalletTransaction>
      orders: TableDef<Order>
      order_items: TableDef<OrderItem>
      mismatches: TableDef<Mismatch>
      invoices: TableDef<Invoice>
      payments: TableDef<Payment>
      vendor_settlements: TableDef<VendorSettlement>
      vendor_settlement_orders: TableDef<VendorSettlementOrder>
      referrals: TableDef<Referral>
      order_logistics_events: TableDef<OrderLogisticsEvent>
      admin_audit_events: TableDef<AdminAuditEvent>
    }
    Views: Record<string, never>
    Functions: {
      has_role: { Args: { p_role: UserRole }; Returns: boolean }
      is_admin: { Args: Record<string, never>; Returns: boolean }
    }
  }
}
