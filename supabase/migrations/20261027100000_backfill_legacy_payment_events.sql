-- Restore the initial collection for active paid orders created before payment
-- events were introduced. Existing event deltas are subtracted so an order
-- already tracked by the trigger is not double-counted. Cancelled orders are
-- excluded because legacy rows cannot prove whether a refund was completed.
WITH recorded_changes AS (
  SELECT order_id, sum(amount_centavos)::bigint AS net_change_centavos
  FROM public.order_payment_events
  GROUP BY order_id
), recoverable_orders AS (
  SELECT
    o.id AS order_id,
    o.payment_method,
    o.paid_at,
    o.total_centavos::bigint - COALESCE(r.net_change_centavos, 0) AS opening_centavos
  FROM public.orders o
  LEFT JOIN recorded_changes r ON r.order_id = o.id
  WHERE o.status <> 'cancelled'
    AND o.payment_method IS NOT NULL
    AND o.paid_at IS NOT NULL
)
INSERT INTO public.order_payment_events (
  order_id,
  amount_centavos,
  payment_method,
  reason,
  created_at
)
SELECT
  order_id,
  opening_centavos::integer,
  payment_method,
  'Opening collection backfill',
  paid_at
FROM recoverable_orders
WHERE opening_centavos BETWEEN 1 AND 2147483647;
