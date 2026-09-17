import { type RouteConfig, index, layout, prefix, route } from '@react-router/dev/routes'

export default [
  route('api/paystack/webhook', 'routes/paystack-webhook.ts'),
  route('api/referrals/attribute', 'routes/referral-attribution.ts'),
  layout('portals/customer/CustomerLayout.tsx', [
    index('portals/customer/pages/Home.tsx'),
    route('transactions', 'portals/customer/pages/Transactions.tsx'),
    route('orders', 'portals/customer/pages/Orders.tsx'),
    route('plans', 'portals/customer/pages/Plans.tsx'),
    route('settings', 'portals/customer/pages/Settings.tsx'),
    route('invoice', 'portals/customer/pages/Invoice.tsx'),
    route('otp', 'portals/customer/pages/OtpFlow.tsx'),
  ]),
  route('login', 'portals/customer/pages/Login.tsx'),
  route('create-account', 'portals/customer/pages/CreateAccount.tsx'),
  route('verify-otp', 'portals/customer/pages/VerifyOtp.tsx'),
  route('auth/callback', 'portals/customer/pages/AuthCallback.tsx'),
  route('complete-profile', 'portals/customer/pages/CompleteProfile.tsx'),

  ...prefix('logistics', [
    layout('portals/logistics/LogisticsLayout.tsx', [
      index('portals/logistics/pages/Home.tsx'),
    ]),
    route('login', 'portals/logistics/pages/Login.tsx'),
    route('verify-otp', 'portals/logistics/pages/VerifyOtp.tsx'),
    route('complete-profile', 'portals/logistics/pages/CompleteProfile.tsx'),
    route('auth/callback', 'portals/customer/pages/AuthCallback.tsx', { id: 'logistics-auth-callback' }),
  ]),

  ...prefix('vendor', [
    layout('portals/vendor/VendorLayout.tsx', [
      index('portals/vendor/pages/Home.tsx'),
      route('orders', 'portals/vendor/pages/Orders.tsx'),
      route('finance', 'portals/vendor/pages/Finance.tsx'),
      route('settings', 'portals/vendor/pages/Settings.tsx'),
    ]),
    route('login', 'portals/vendor/pages/Login.tsx'),
    route('complete-profile', 'portals/vendor/pages/CompleteProfile.tsx'),
    route('auth/callback', 'portals/customer/pages/AuthCallback.tsx', { id: 'vendor-auth-callback' }),
  ]),

  ...prefix('admin', [
    layout('portals/admin/AdminLayout.tsx', [
      index('portals/admin/pages/Home.tsx'),
      route('orders', 'portals/admin/pages/Orders.tsx'),
      route('finance', 'portals/admin/pages/Finance.tsx'),
      route('categories', 'portals/admin/pages/Categories.tsx'),
      route('pickup-locations', 'portals/admin/pages/PickupLocations.tsx'),
      route('mismatches', 'portals/admin/pages/Mismatches.tsx'),
      route('plans', 'portals/admin/pages/Plans.tsx'),
      route('referrals', 'portals/admin/pages/Referrals.tsx'),
      route('admins', 'portals/admin/pages/Admins.tsx'),
      route('partners', 'portals/admin/pages/Partners.tsx'),
      route('partners/vendors', 'portals/admin/pages/Vendors.tsx'),
      route('partners/logistics', 'portals/admin/pages/Logistics.tsx'),
      route('users', 'portals/admin/pages/Users.tsx'),
      route('users/:id', 'portals/admin/pages/UserDetails.tsx'),
    ]),
    route('login', 'portals/admin/pages/Login.tsx'),
    route('auth/callback', 'portals/customer/pages/AuthCallback.tsx', { id: 'admin-auth-callback' }),
  ]),
] satisfies RouteConfig
