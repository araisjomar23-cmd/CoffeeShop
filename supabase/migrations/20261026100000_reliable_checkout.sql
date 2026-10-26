-- Checkout details are nullable for historical orders, whose payment details
-- were not recorded by the original version of the POS.
ALTER TABLE public.orders
  ADD COLUMN order_type text CHECK (order_type IN ('dine_in', 'takeaway')),
  ADD COLUMN payment_method text CHECK (payment_method IN ('cash', 'card', 'e_wallet')),
  ADD COLUMN cash_received_centavos integer CHECK (cash_received_centavos >= 0),
  ADD COLUMN change_centavos integer CHECK (change_centavos >= 0),
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN cancellation_reason text;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_details_check CHECK (
    payment_method IS NULL
    OR (payment_method = 'cash' AND cash_received_centavos IS NOT NULL AND change_centavos IS NOT NULL)
    OR (payment_method IN ('card', 'e_wallet') AND cash_received_centavos IS NULL AND change_centavos = 0)
  );

DROP FUNCTION public.create_order(text, jsonb);

CREATE FUNCTION public.create_order(
  p_customer_name text,
  p_items jsonb,
  p_order_type text,
  p_payment_method text,
  p_cash_received_centavos integer
)
RETURNS TABLE (order_id uuid, order_number integer, total_centavos integer, change_centavos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_item_name text;
  v_note text;
  v_unit_price_centavos integer;
  v_order_id uuid;
  v_order_number integer;
  v_total_centavos bigint := 0;
  v_change_centavos integer := 0;
BEGIN
  IF public.current_staff_role() NOT IN ('owner', 'cashier') THEN
    RAISE EXCEPTION 'Only shop staff can create orders.';
  END IF;

  IF p_order_type IS NULL OR p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'Choose dine-in or takeaway.';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'card', 'e_wallet') THEN
    RAISE EXCEPTION 'Choose a supported payment method.';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) = 0
    OR jsonb_array_length(p_items) > 50
  THEN
    RAISE EXCEPTION 'An order must contain between 1 and 50 items.';
  END IF;

  INSERT INTO public.orders AS inserted_order (customer_name, status, order_type, payment_method)
  VALUES (NULLIF(btrim(p_customer_name), ''), 'new', p_order_type, p_payment_method)
  RETURNING inserted_order.id, inserted_order.order_number
    INTO v_order_id, v_order_number;

  FOR v_item IN SELECT item.value FROM jsonb_array_elements(p_items) AS item(value)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR NOT (v_item ? 'menu_item_id')
      OR NOT (v_item ? 'quantity')
      OR (v_item - ARRAY['menu_item_id', 'quantity', 'note']::text[]) <> '{}'::jsonb
    THEN
      RAISE EXCEPTION 'Each item needs a menu item ID and quantity, with an optional note.';
    END IF;

    IF jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number'
      OR (v_item ->> 'quantity') !~ '^[1-9][0-9]?$'
    THEN
      RAISE EXCEPTION 'Each quantity must be an integer between 1 and 99.';
    END IF;
    v_quantity := (v_item ->> 'quantity')::integer;

    IF jsonb_typeof(v_item -> 'menu_item_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Each item must have a valid menu item ID.';
    END IF;
    BEGIN
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Each item must have a valid menu item ID.';
    END;

    IF v_item ? 'note' AND jsonb_typeof(v_item -> 'note') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Item notes must be text.';
    END IF;
    v_note := NULLIF(btrim(v_item ->> 'note'), '');
    IF length(v_note) > 140 THEN
      RAISE EXCEPTION 'Item notes must be 140 characters or fewer.';
    END IF;

    SELECT menu_item.name, menu_item.price_centavos
      INTO v_item_name, v_unit_price_centavos
      FROM public.menu_items AS menu_item
     WHERE menu_item.id = v_menu_item_id AND menu_item.is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item does not exist or is inactive.';
    END IF;

    INSERT INTO public.order_items (
      order_id, menu_item_id, item_name, unit_price_centavos, quantity, note
    ) VALUES (
      v_order_id, v_menu_item_id, v_item_name, v_unit_price_centavos, v_quantity, v_note
    );
    v_total_centavos := v_total_centavos + (v_unit_price_centavos::bigint * v_quantity);
  END LOOP;

  IF v_total_centavos > 2147483647 THEN
    RAISE EXCEPTION 'Order total is too large.';
  END IF;

  IF p_payment_method = 'cash' THEN
    IF p_cash_received_centavos IS NULL OR p_cash_received_centavos < v_total_centavos THEN
      RAISE EXCEPTION 'Cash received must cover the order total.';
    END IF;
    v_change_centavos := p_cash_received_centavos - v_total_centavos;
  ELSIF p_cash_received_centavos IS NOT NULL THEN
    RAISE EXCEPTION 'Cash received should only be entered for cash payments.';
  END IF;

  UPDATE public.orders AS existing_order
     SET total_centavos = v_total_centavos::integer,
         cash_received_centavos = p_cash_received_centavos,
         change_centavos = v_change_centavos,
         paid_at = now()
   WHERE existing_order.id = v_order_id;

  RETURN QUERY SELECT v_order_id, v_order_number, v_total_centavos::integer, v_change_centavos;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(text, jsonb, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(text, jsonb, text, text, integer) TO authenticated;

CREATE FUNCTION public.cancel_order(p_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.current_staff_role() <> 'owner' THEN
    RAISE EXCEPTION 'Only the owner can cancel a paid order.';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 OR length(btrim(p_reason)) > 250 THEN
    RAISE EXCEPTION 'Enter a cancellation reason between 3 and 250 characters.';
  END IF;

  UPDATE public.orders
     SET status = 'cancelled', cancellation_reason = btrim(p_reason)
   WHERE id = p_order_id AND status <> 'cancelled';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order was not found or has already been cancelled.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
