-- Keep payment columns for future use, but allow checkout to place unpaid,
-- unclassified orders while payment collection is out of scope.
CREATE OR REPLACE FUNCTION public.create_order(
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
  IF p_payment_method IS NOT NULL AND p_payment_method NOT IN ('cash', 'card', 'e_wallet') THEN
    RAISE EXCEPTION 'Choose a supported payment method.';
  END IF;
  IF p_payment_method IS NULL AND p_cash_received_centavos IS NOT NULL THEN
    RAISE EXCEPTION 'Cash received requires a payment method.';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) = 0
    OR jsonb_array_length(p_items) > 50
  THEN
    RAISE EXCEPTION 'An order must contain between 1 and 50 items.';
  END IF;

  INSERT INTO public.orders AS inserted_order (customer_name, status, order_type)
  VALUES (NULLIF(btrim(p_customer_name), ''), 'new', p_order_type)
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
    INSERT INTO public.order_items (order_id, menu_item_id, item_name, unit_price_centavos, quantity, note)
    VALUES (v_order_id, v_menu_item_id, v_item_name, v_unit_price_centavos, v_quantity, v_note);
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
  ELSIF p_payment_method IS NOT NULL AND p_cash_received_centavos IS NOT NULL THEN
    RAISE EXCEPTION 'Cash received should only be entered for cash payments.';
  END IF;

  UPDATE public.orders AS existing_order
     SET total_centavos = v_total_centavos::integer,
         cash_received_centavos = p_cash_received_centavos,
         change_centavos = CASE WHEN p_payment_method IS NULL THEN NULL ELSE v_change_centavos END,
         paid_at = CASE WHEN p_payment_method IS NULL THEN NULL ELSE now() END,
         payment_method = p_payment_method
   WHERE existing_order.id = v_order_id;

  RETURN QUERY SELECT v_order_id, v_order_number, v_total_centavos::integer, v_change_centavos;
END;
$$;

NOTIFY pgrst, 'reload schema';
