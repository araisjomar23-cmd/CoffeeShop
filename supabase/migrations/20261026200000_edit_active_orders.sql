CREATE FUNCTION public.edit_active_order(
  p_order_id uuid,
  p_customer_name text,
  p_order_type text,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item jsonb;
  v_order_item_id uuid;
  v_quantity integer;
  v_note text;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_remaining_items integer;
  v_total_centavos bigint;
BEGIN
  IF public.current_staff_role() NOT IN ('owner', 'cashier') THEN
    RAISE EXCEPTION 'Only shop staff can edit orders.';
  END IF;
  IF p_customer_name IS NULL OR length(p_customer_name) > 100 THEN
    RAISE EXCEPTION 'Customer name must be 100 characters or fewer.';
  END IF;
  IF p_order_type IS NULL OR p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'Choose dine-in or takeaway.';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) = 0
    OR jsonb_array_length(p_items) > 50
  THEN
    RAISE EXCEPTION 'An order must contain between 1 and 50 existing items.';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status NOT IN ('new', 'ready') THEN
    RAISE EXCEPTION 'Only active, uncompleted orders can be edited.';
  END IF;

  FOR v_item IN SELECT item.value FROM jsonb_array_elements(p_items) AS item(value)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR (v_item - ARRAY['order_item_id', 'quantity', 'note']::text[]) <> '{}'::jsonb
      OR NOT (v_item ? 'order_item_id')
      OR NOT (v_item ? 'quantity')
    THEN
      RAISE EXCEPTION 'Each edited item needs its order item ID and quantity.';
    END IF;
    IF jsonb_typeof(v_item -> 'order_item_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number'
      OR (v_item ->> 'quantity') !~ '^(0|[1-9][0-9]?)$'
    THEN
      RAISE EXCEPTION 'Item IDs and quantities are invalid.';
    END IF;
    BEGIN
      v_order_item_id := (v_item ->> 'order_item_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Each edited item needs a valid order item ID.';
    END;
    IF v_order_item_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'An order item cannot appear more than once.';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_order_item_id);

    v_quantity := (v_item ->> 'quantity')::integer;
    IF v_item ? 'note' AND jsonb_typeof(v_item -> 'note') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Item notes must be text.';
    END IF;
    v_note := NULLIF(btrim(v_item ->> 'note'), '');
    IF length(v_note) > 140 THEN
      RAISE EXCEPTION 'Item notes must be 140 characters or fewer.';
    END IF;

    IF v_quantity = 0 THEN
      DELETE FROM public.order_items WHERE id = v_order_item_id AND order_id = p_order_id;
    ELSE
      UPDATE public.order_items
         SET quantity = v_quantity, note = v_note
       WHERE id = v_order_item_id AND order_id = p_order_id;
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'An order item was not found on this order.';
    END IF;
  END LOOP;

  SELECT count(*), COALESCE(sum(unit_price_centavos::bigint * quantity), 0)
    INTO v_remaining_items, v_total_centavos
    FROM public.order_items WHERE order_id = p_order_id;
  IF v_remaining_items = 0 THEN
    RAISE EXCEPTION 'An order must keep at least one item.';
  END IF;
  IF v_total_centavos > 2147483647 THEN
    RAISE EXCEPTION 'Order total is too large.';
  END IF;
  IF v_order.payment_method = 'cash'
    AND (v_order.cash_received_centavos IS NULL OR v_order.cash_received_centavos < v_total_centavos)
  THEN
    RAISE EXCEPTION 'The edited total exceeds the cash received. Cancel and replace the order instead.';
  END IF;

  UPDATE public.orders
     SET customer_name = NULLIF(btrim(p_customer_name), ''),
         order_type = p_order_type,
         total_centavos = v_total_centavos::integer,
         change_centavos = CASE
           WHEN v_order.payment_method = 'cash' THEN v_order.cash_received_centavos - v_total_centavos::integer
           WHEN v_order.payment_method IS NOT NULL THEN 0
           ELSE NULL
         END
   WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.edit_active_order(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_active_order(uuid, text, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
