CREATE TABLE public.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('g', 'ml', 'each')),
  quantity_on_hand numeric(12,3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  low_stock_threshold numeric(12,3) NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ingredients_name_lower_idx ON public.ingredients (lower(name));

CREATE TABLE public.menu_item_recipes (
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity_per_item numeric(12,3) NOT NULL CHECK (quantity_per_item > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (menu_item_id, ingredient_id)
);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('restock', 'waste', 'adjustment', 'sale')),
  quantity_delta numeric(12,3) NOT NULL CHECK (quantity_delta <> 0),
  reason text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (movement_type = 'restock' AND quantity_delta > 0 AND order_id IS NULL)
    OR (movement_type = 'waste' AND quantity_delta < 0 AND order_id IS NULL)
    OR (movement_type = 'adjustment' AND order_id IS NULL)
    OR (movement_type = 'sale' AND quantity_delta < 0 AND order_id IS NOT NULL)
  )
);
CREATE INDEX inventory_movements_ingredient_created_idx
  ON public.inventory_movements (ingredient_id, created_at DESC);

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ingredients, public.menu_item_recipes, public.inventory_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ingredients, public.menu_item_recipes, public.inventory_movements TO authenticated;

CREATE POLICY inventory_owner_read_ingredients ON public.ingredients
  FOR SELECT TO authenticated USING (public.current_staff_role() = 'owner');
CREATE POLICY inventory_owner_read_recipes ON public.menu_item_recipes
  FOR SELECT TO authenticated USING (public.current_staff_role() = 'owner');
CREATE POLICY inventory_owner_read_movements ON public.inventory_movements
  FOR SELECT TO authenticated USING (public.current_staff_role() = 'owner');

CREATE FUNCTION public.create_ingredient(p_name text, p_unit text, p_low_stock_threshold numeric)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_id uuid;
BEGIN
  IF public.current_staff_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the owner can manage inventory.';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) < 2 OR length(btrim(p_name)) > 80 THEN
    RAISE EXCEPTION 'Ingredient name must be between 2 and 80 characters.';
  END IF;
  IF p_unit NOT IN ('g', 'ml', 'each') THEN
    RAISE EXCEPTION 'Choose g, ml, or each as the stock unit.';
  END IF;
  IF p_low_stock_threshold IS NULL OR p_low_stock_threshold < 0 THEN
    RAISE EXCEPTION 'Low-stock threshold cannot be negative.';
  END IF;
  INSERT INTO public.ingredients (name, unit, low_stock_threshold)
  VALUES (btrim(p_name), p_unit, p_low_stock_threshold)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.set_menu_item_recipe(p_menu_item_id uuid, p_ingredient_id uuid, p_quantity_per_item numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.current_staff_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the owner can manage recipes.';
  END IF;
  IF p_quantity_per_item IS NULL OR p_quantity_per_item <= 0 THEN
    RAISE EXCEPTION 'Recipe quantity must be greater than zero.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.menu_items WHERE id = p_menu_item_id AND is_active) THEN
    RAISE EXCEPTION 'Choose an active menu item.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ingredients WHERE id = p_ingredient_id) THEN
    RAISE EXCEPTION 'Choose a valid ingredient.';
  END IF;
  INSERT INTO public.menu_item_recipes (menu_item_id, ingredient_id, quantity_per_item)
  VALUES (p_menu_item_id, p_ingredient_id, p_quantity_per_item)
  ON CONFLICT (menu_item_id, ingredient_id)
  DO UPDATE SET quantity_per_item = EXCLUDED.quantity_per_item;
END;
$$;

CREATE FUNCTION public.remove_menu_item_recipe(p_menu_item_id uuid, p_ingredient_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.current_staff_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the owner can manage recipes.';
  END IF;
  DELETE FROM public.menu_item_recipes
   WHERE menu_item_id = p_menu_item_id AND ingredient_id = p_ingredient_id;
END;
$$;

CREATE FUNCTION public.record_inventory_movement(
  p_ingredient_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_adjustment_direction text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_delta numeric(12,3);
  v_balance numeric(12,3);
BEGIN
  IF public.current_staff_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the owner can change inventory.';
  END IF;
  IF p_movement_type NOT IN ('restock', 'waste', 'adjustment') THEN
    RAISE EXCEPTION 'Choose restock, waste, or adjustment.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 OR length(btrim(p_reason)) > 200 THEN
    RAISE EXCEPTION 'Enter a reason between 3 and 200 characters.';
  END IF;
  v_delta := CASE
    WHEN p_movement_type = 'restock' THEN p_quantity
    WHEN p_movement_type = 'waste' THEN -p_quantity
    WHEN p_adjustment_direction = 'add' THEN p_quantity
    WHEN p_adjustment_direction = 'subtract' THEN -p_quantity
    ELSE NULL
  END;
  IF v_delta IS NULL THEN
    RAISE EXCEPTION 'Choose whether the adjustment adds or subtracts stock.';
  END IF;

  SELECT quantity_on_hand INTO v_balance
    FROM public.ingredients WHERE id = p_ingredient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ingredient was not found.'; END IF;
  IF v_balance + v_delta < 0 THEN
    RAISE EXCEPTION 'This change would make stock negative.';
  END IF;

  UPDATE public.ingredients SET quantity_on_hand = v_balance + v_delta WHERE id = p_ingredient_id;
  INSERT INTO public.inventory_movements (ingredient_id, movement_type, quantity_delta, reason, created_by)
  VALUES (p_ingredient_id, p_movement_type, v_delta, btrim(p_reason), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_order(p_order_id uuid, p_next_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current_status text;
  v_order_number integer;
  v_need record;
  v_balance numeric(12,3);
BEGIN
  IF public.current_staff_role() NOT IN ('owner', 'cashier') THEN
    RAISE EXCEPTION 'Only shop staff can update preparation status.';
  END IF;
  IF p_next_status NOT IN ('ready', 'completed', 'new') THEN
    RAISE EXCEPTION 'Unsupported order status.';
  END IF;

  SELECT status, order_number INTO v_current_status, v_order_number
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order was not found.'; END IF;

  IF v_current_status = 'ready' AND p_next_status = 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.inventory_movements
       WHERE order_id = p_order_id AND movement_type = 'sale'
    )
  THEN
    -- Lock and validate every required balance before changing any stock.
    FOR v_need IN
      SELECT recipe.ingredient_id, sum(recipe.quantity_per_item * item.quantity)::numeric(12,3) AS needed
        FROM public.order_items AS item
        JOIN public.menu_item_recipes AS recipe ON recipe.menu_item_id = item.menu_item_id
       WHERE item.order_id = p_order_id
       GROUP BY recipe.ingredient_id
       ORDER BY recipe.ingredient_id
    LOOP
      SELECT quantity_on_hand INTO v_balance FROM public.ingredients WHERE id = v_need.ingredient_id FOR UPDATE;
      IF v_balance < v_need.needed THEN
        RAISE EXCEPTION 'Not enough % in stock to complete this order.',
          (SELECT name FROM public.ingredients WHERE id = v_need.ingredient_id);
      END IF;
    END LOOP;

    FOR v_need IN
      SELECT recipe.ingredient_id, sum(recipe.quantity_per_item * item.quantity)::numeric(12,3) AS needed
        FROM public.order_items AS item
        JOIN public.menu_item_recipes AS recipe ON recipe.menu_item_id = item.menu_item_id
       WHERE item.order_id = p_order_id
       GROUP BY recipe.ingredient_id
       ORDER BY recipe.ingredient_id
    LOOP
      UPDATE public.ingredients
         SET quantity_on_hand = quantity_on_hand - v_need.needed
       WHERE id = v_need.ingredient_id;
      INSERT INTO public.inventory_movements (ingredient_id, movement_type, quantity_delta, reason, order_id, created_by)
      VALUES (v_need.ingredient_id, 'sale', -v_need.needed, 'Order #' || v_order_number, p_order_id, auth.uid());
    END LOOP;
  END IF;

  IF (v_current_status = 'new' AND p_next_status = 'ready')
    OR (v_current_status = 'ready' AND p_next_status = 'completed')
    OR (v_current_status = 'completed' AND p_next_status = 'new')
  THEN
    UPDATE public.orders SET status = p_next_status WHERE id = p_order_id;
    RETURN;
  END IF;
  RAISE EXCEPTION 'Order cannot move from % to %.', v_current_status, p_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ingredient(text, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_menu_item_recipe(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_menu_item_recipe(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_inventory_movement(uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ingredient(text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_menu_item_recipe(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_menu_item_recipe(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_movement(uuid, text, numeric, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
