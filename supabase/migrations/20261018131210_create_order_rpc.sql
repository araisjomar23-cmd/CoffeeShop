CREATE FUNCTION public.create_order(
  p_customer_name text,
  p_items jsonb
)
RETURNS TABLE (order_id uuid, order_number integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_item_name text;
  v_unit_price_centavos integer;
  v_order_id uuid;
  v_order_number integer;
  v_total_centavos integer := 0;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array.';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one menu item is required.';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'An order cannot contain more than 50 menu items.';
  END IF;

  INSERT INTO public.orders AS inserted_order (customer_name, status)
  VALUES (NULLIF(btrim(p_customer_name), ''), 'new')
  RETURNING inserted_order.id, inserted_order.order_number
    INTO v_order_id, v_order_number;

  FOR v_item IN
    SELECT item.value
    FROM jsonb_array_elements(p_items) AS item(value)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Each p_items entry must be an object.';
    END IF;

    IF NOT (v_item ? 'menu_item_id')
      OR NOT (v_item ? 'quantity')
      OR v_item - ARRAY['menu_item_id', 'quantity']::text[] <> '{}'::jsonb
    THEN
      RAISE EXCEPTION 'Each item must contain only menu_item_id and quantity.';
    END IF;

    IF jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number'
      OR (v_item ->> 'quantity') IS NULL
      OR (v_item ->> 'quantity') !~ '^[1-9][0-9]?$'
    THEN
      RAISE EXCEPTION 'Each item quantity must be an integer between 1 and 99.';
    END IF;
    v_quantity := (v_item ->> 'quantity')::integer;

    IF jsonb_typeof(v_item -> 'menu_item_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Each item menu_item_id must be a valid UUID.';
    END IF;

    BEGIN
      v_menu_item_id := (v_item ->> 'menu_item_id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Each item menu_item_id must be a valid UUID.';
    END;

    -- Intentionally omit a row lock so callers with SELECT-only access can use this function.
    SELECT menu_item.name, menu_item.price_centavos
      INTO v_item_name, v_unit_price_centavos
      FROM public.menu_items AS menu_item
     WHERE menu_item.id = v_menu_item_id
       AND menu_item.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % does not exist or is inactive.', v_menu_item_id;
    END IF;

    INSERT INTO public.order_items (
      order_id,
      menu_item_id,
      item_name,
      unit_price_centavos,
      quantity
    )
    VALUES (
      v_order_id,
      v_menu_item_id,
      v_item_name,
      v_unit_price_centavos,
      v_quantity
    );

    v_total_centavos := v_total_centavos + (v_unit_price_centavos * v_quantity);
  END LOOP;

  UPDATE public.orders AS existing_order
     SET total_centavos = v_total_centavos
   WHERE existing_order.id = v_order_id;

  RETURN QUERY SELECT v_order_id, v_order_number;
END;
$$;
