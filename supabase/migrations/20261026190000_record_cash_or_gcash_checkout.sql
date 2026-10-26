-- Record the selected payment method when staff places an order. Cash tender
-- and change are not collected by this POS flow, so those values stay null.
ALTER TABLE public.orders
  DROP CONSTRAINT orders_payment_details_check,
  ADD CONSTRAINT orders_payment_details_check CHECK (
    payment_method IS NULL
    OR (
      payment_method = 'cash'
      AND (
        (cash_received_centavos IS NULL AND change_centavos IS NULL)
        OR (cash_received_centavos IS NOT NULL AND change_centavos IS NOT NULL)
      )
    )
    OR (payment_method IN ('card', 'e_wallet') AND cash_received_centavos IS NULL AND change_centavos = 0)
  );

DROP FUNCTION public.create_order_idempotent(uuid, text, jsonb, text);

CREATE FUNCTION public.create_order_idempotent(
  p_request_id uuid,
  p_customer_name text,
  p_items jsonb,
  p_order_type text,
  p_payment_method text
)
RETURNS TABLE (order_id uuid, order_number integer, total_centavos integer, change_centavos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.orders%ROWTYPE;
  v_created record;
BEGIN
  IF public.current_staff_role() NOT IN ('owner', 'cashier') THEN
    RAISE EXCEPTION 'Only shop staff can create orders.';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'An order request ID is required.';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'e_wallet') THEN
    RAISE EXCEPTION 'Choose cash or cashless (GCash).';
  END IF;

  SELECT * INTO v_existing FROM public.orders WHERE request_id = p_request_id;
  IF FOUND THEN
    -- A saved ticket from before payment choices were added may retry with the
    -- same request ID. Fill its missing method instead of duplicating the sale.
    IF v_existing.payment_method IS NULL THEN
      UPDATE public.orders AS existing_order
         SET payment_method = p_payment_method,
             cash_received_centavos = NULL,
             change_centavos = CASE WHEN p_payment_method = 'cash' THEN NULL ELSE 0 END,
             paid_at = now()
       WHERE existing_order.id = v_existing.id
       RETURNING * INTO v_existing;
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.order_number, v_existing.total_centavos,
      COALESCE(v_existing.change_centavos, 0);
    RETURN;
  END IF;

  BEGIN
    SELECT * INTO v_created FROM public.create_order(
      p_customer_name, p_items, p_order_type, NULL, NULL
    );
    UPDATE public.orders AS existing_order
       SET request_id = p_request_id,
           payment_method = p_payment_method,
           cash_received_centavos = NULL,
           change_centavos = CASE WHEN p_payment_method = 'cash' THEN NULL ELSE 0 END,
           paid_at = now()
     WHERE existing_order.id = v_created.order_id;
    RETURN QUERY SELECT v_created.order_id, v_created.order_number,
      v_created.total_centavos, 0;
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent retry may win the unique request ID after our initial read.
    SELECT * INTO v_existing FROM public.orders WHERE request_id = p_request_id;
    IF NOT FOUND THEN
      RAISE;
    END IF;
    IF v_existing.payment_method IS NULL THEN
      UPDATE public.orders AS existing_order
         SET payment_method = p_payment_method,
             cash_received_centavos = NULL,
             change_centavos = CASE WHEN p_payment_method = 'cash' THEN NULL ELSE 0 END,
             paid_at = now()
       WHERE existing_order.id = v_existing.id
       RETURNING * INTO v_existing;
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.order_number, v_existing.total_centavos,
      COALESCE(v_existing.change_centavos, 0);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_idempotent(uuid, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_idempotent(uuid, text, jsonb, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
