-- Subscription excess charges may create a negative one-off wallet balance.
-- Delivery payments still use payFromWallet(), which refuses to issue a delivery OTP
-- until the wallet has enough funds to cover the invoice.
alter table public.wallets
  drop constraint if exists wallets_one_off_balance_check;