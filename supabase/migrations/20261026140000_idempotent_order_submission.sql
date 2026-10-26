-- A retry after a lost response must return the first order rather than charge
-- the ticket twice. The request ID is generated per unchanged ticket.
ALTER TABLE public.orders ADD COLUMN request_id uuid;
CREATE UNIQUE INDEX orders_request_id_unique
  ON public.orders (request_id)
  WHERE request_id IS NOT NULL;

CREATE FUNCTION public.create_order_idempotent(
  p_request_id uuid,
  p_customer_name text,
  p_items jsonb,
  p_order_type text
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

  SELECT * INTO v_existing FROM public.orders WHERE request_id = p_request_id;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.order_number, v_existing.total_centavos,
      COALESCE(v_existing.change_centavos, 0);
    RETURN;
  END IF;

  BEGIN
    SELECT * INTO v_created FROM public.create_order(
      p_customer_name, p_items, p_order_type, NULL, NULL
    );
    UPDATE public.orders SET request_id = p_request_id WHERE id = v_created.order_id;
    RETURN QUERY SELECT v_created.order_id, v_created.order_number,
      v_created.total_centavos, v_created.change_centavos;
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent retry may win the unique request ID after our initial read.
    SELECT * INTO v_existing FROM public.orders WHERE request_id = p_request_id;
    IF NOT FOUND THEN
      RAISE;
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.order_number, v_existing.total_centavos,
      COALESCE(v_existing.change_centavos, 0);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_idempotent(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_idempotent(uuid, text, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
