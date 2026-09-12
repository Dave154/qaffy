import { type RouteConfig, index, layout, prefix, route } from '@react-router/dev/routes'

export default [
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
      route('delivery', 'portals/logistics/pages/Delivery.tsx', { id: 'logistics-delivery' }),
    ]),
    route('login', 'portals/logistics/pages/Login.tsx'),
    route('verify-otp', 'portals/logistics/pages/VerifyOtp.tsx'),
    route('auth/callback', 'portals/customer/pages/AuthCallback.tsx', { id: 'logistics-auth-callback' }),
  ]),

  ...prefix('vendor', [
    layout('portals/vendor/VendorLayout.tsx', [
      index('portals/vendor/pages/Home.tsx'),
      route('orders', 'portals/vendor/pages/Orders.tsx'),
      route('clearing-history', 'portals/vendor/pages/ClearingHistory.tsx'),
    ]),
    route('login', 'portals/vendor/pages/Login.tsx'),
    route('auth/callback', 'portals/customer/pages/AuthCallback.tsx', { id: 'vendor-auth-callback' }),
  ]),

  ...prefix('admin', [
    layout('portals/admin/AdminLayout.tsx', [
      index('portals/admin/pages/Home.tsx'),
    ]),
    route('login', 'portals/admin/pages/Login.tsx'),
    route('auth/callback', 'portals/customer/pages/AuthCallback.tsx', { id: 'admin-auth-callback' }),
  ]),
] satisfies RouteConfig
