CREATE OR REPLACE FUNCTION public.edit_active_order(
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
  v_addon_json jsonb;
  v_order_item_id uuid;
  v_menu_item_id uuid;
  v_addon_id uuid;
  v_selected_addon_ids uuid[];
  v_addon_names text[];
  v_quantity integer;
  v_note text;
  v_item_name text;
  v_item_category text;
  v_addon_name text;
  v_base_price_centavos integer;
  v_addon_price_centavos integer;
  v_unit_price_centavos bigint;
  v_addon_total bigint;
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
    OR jsonb_array_length(p_items) > 100
  THEN
    RAISE EXCEPTION 'The order edit contains too many lines.';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status NOT IN ('new', 'ready') THEN
    RAISE EXCEPTION 'Only active, uncompleted orders can be edited.';
  END IF;

  FOR v_item IN SELECT item.value FROM jsonb_array_elements(p_items) AS item(value)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR NOT (v_item ? 'quantity') THEN
      RAISE EXCEPTION 'Each edited item needs a quantity.';
    END IF;
    IF jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number'
      OR (v_item ->> 'quantity') !~ '^(0|[1-9][0-9]?)$'
    THEN
      RAISE EXCEPTION 'Item quantities must be integers between 0 and 99.';
    END IF;
    v_quantity := (v_item ->> 'quantity')::integer;
    IF v_item ? 'note' AND jsonb_typeof(v_item -> 'note') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'Item notes must be text.';
    END IF;
    v_note := NULLIF(btrim(v_item ->> 'note'), '');
    IF length(v_note) > 140 THEN
      RAISE EXCEPTION 'Item notes must be 140 characters or fewer.';
    END IF;

    IF v_item ? 'order_item_id' THEN
      IF (v_item - ARRAY['order_item_id', 'quantity', 'note']::text[]) <> '{}'::jsonb
        OR jsonb_typeof(v_item -> 'order_item_id') IS DISTINCT FROM 'string'
      THEN
        RAISE EXCEPTION 'An existing order line is invalid.';
      END IF;
      BEGIN
        v_order_item_id := (v_item ->> 'order_item_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Each edited line needs a valid order item ID.';
      END;
      IF v_order_item_id = ANY(v_seen_ids) THEN
        RAISE EXCEPTION 'An order line cannot be included more than once.';
      END IF;
      v_seen_ids := array_append(v_seen_ids, v_order_item_id);
      IF v_quantity = 0 THEN
        DELETE FROM public.order_items WHERE id = v_order_item_id AND order_id = p_order_id;
      ELSE
        UPDATE public.order_items SET quantity = v_quantity, note = v_note
         WHERE id = v_order_item_id AND order_id = p_order_id;
      END IF;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'An order line was not found on this order.';
      END IF;
    ELSE
      IF (v_item - ARRAY['menu_item_id', 'quantity', 'note', 'addon_ids']::text[]) <> '{}'::jsonb
        OR NOT (v_item ? 'menu_item_id')
        OR jsonb_typeof(v_item -> 'menu_item_id') IS DISTINCT FROM 'string'
        OR v_quantity < 1
      THEN
        RAISE EXCEPTION 'Each new item needs a valid menu item and a quantity from 1 to 99.';
      END IF;
      BEGIN
        v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Each new item needs a valid menu item ID.';
      END;
      IF v_item ? 'addon_ids' AND jsonb_typeof(v_item -> 'addon_ids') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Add-ons must be provided as a list.';
      END IF;
      IF jsonb_array_length(COALESCE(v_item -> 'addon_ids', '[]'::jsonb)) > 3 THEN
        RAISE EXCEPTION 'An item cannot have more than three add-ons.';
      END IF;

      SELECT name, category, price_centavos
        INTO v_item_name, v_item_category, v_base_price_centavos
        FROM public.menu_items
       WHERE id = v_menu_item_id AND is_active = true AND category <> 'Add-ons';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Menu item does not exist or is inactive.';
      END IF;

      v_selected_addon_ids := ARRAY[]::uuid[];
      v_addon_names := ARRAY[]::text[];
      v_addon_total := 0;
      FOR v_addon_json IN
        SELECT addon.value FROM jsonb_array_elements(COALESCE(v_item -> 'addon_ids', '[]'::jsonb)) AS addon(value)
      LOOP
        IF jsonb_typeof(v_addon_json) IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'Each add-on must have a valid ID.';
        END IF;
        BEGIN
          v_addon_id := (v_addon_json #>> '{}')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'Each add-on must have a valid ID.';
        END;
        IF v_addon_id = ANY(v_selected_addon_ids) THEN
          RAISE EXCEPTION 'The same add-on cannot be selected more than once.';
        END IF;
        v_selected_addon_ids := array_append(v_selected_addon_ids, v_addon_id);
        SELECT name, price_centavos INTO v_addon_name, v_addon_price_centavos
          FROM public.menu_items WHERE id = v_addon_id AND category = 'Add-ons' AND is_active = true;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Selected add-on does not exist or is inactive.';
        END IF;
        IF NOT (
          (v_item_category = 'Milk Tea' AND v_addon_name = 'Pearl')
          OR (v_item_category = 'Burgers' AND v_addon_name IN ('Lettuce', 'Cheese', 'Egg'))
        ) THEN
          RAISE EXCEPTION 'That add-on is not available for this item.';
        END IF;
        v_addon_names := array_append(v_addon_names, v_addon_name);
        v_addon_total := v_addon_total + v_addon_price_centavos;
      END LOOP;

      v_unit_price_centavos := v_base_price_centavos::bigint + v_addon_total;
      IF v_unit_price_centavos > 2147483647 THEN
        RAISE EXCEPTION 'Order item price is too large.';
      END IF;
      IF cardinality(v_addon_names) > 0 THEN
        v_item_name := v_item_name || ' + ' || array_to_string(v_addon_names, ', ');
      END IF;
      INSERT INTO public.order_items (order_id, menu_item_id, item_name, unit_price_centavos, quantity, note)
      VALUES (p_order_id, v_menu_item_id, v_item_name, v_unit_price_centavos::integer, v_quantity, v_note);
    END IF;
  END LOOP;

  SELECT count(*), COALESCE(sum(unit_price_centavos::bigint * quantity), 0)
    INTO v_remaining_items, v_total_centavos
    FROM public.order_items WHERE order_id = p_order_id;
  IF v_remaining_items = 0 THEN
    RAISE EXCEPTION 'An order must keep at least one item.';
  END IF;
  IF v_remaining_items > 50 THEN
    RAISE EXCEPTION 'An order cannot contain more than 50 active lines.';
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
