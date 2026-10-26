-- Replace temporary development access with account-based POS access.
CREATE TABLE public.staff_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'cashier')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.current_staff_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT staff_profiles.role
    FROM public.staff_profiles AS staff_profiles
   WHERE staff_profiles.user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_staff_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_staff_role() TO authenticated;

DROP POLICY IF EXISTS menu_items_dev_select ON public.menu_items;
DROP POLICY IF EXISTS menu_items_dev_insert ON public.menu_items;
DROP POLICY IF EXISTS menu_items_dev_update ON public.menu_items;
DROP POLICY IF EXISTS menu_items_dev_delete ON public.menu_items;
DROP POLICY IF EXISTS orders_dev_select ON public.orders;
DROP POLICY IF EXISTS orders_dev_insert ON public.orders;
DROP POLICY IF EXISTS orders_dev_update ON public.orders;
DROP POLICY IF EXISTS orders_dev_delete ON public.orders;
DROP POLICY IF EXISTS order_items_dev_select ON public.order_items;
DROP POLICY IF EXISTS order_items_dev_insert ON public.order_items;
DROP POLICY IF EXISTS order_items_dev_update ON public.order_items;
DROP POLICY IF EXISTS order_items_dev_delete ON public.order_items;

REVOKE ALL ON public.staff_profiles, public.menu_items, public.orders, public.order_items
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_profiles, public.menu_items, public.orders, public.order_items
  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;

CREATE POLICY staff_profiles_read_self
  ON public.staff_profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY menu_items_staff_read
  ON public.menu_items FOR SELECT TO authenticated
  USING (public.current_staff_role() IN ('owner', 'cashier'));
CREATE POLICY menu_items_owner_insert
  ON public.menu_items FOR INSERT TO authenticated
  WITH CHECK (public.current_staff_role() = 'owner');
CREATE POLICY menu_items_owner_update
  ON public.menu_items FOR UPDATE TO authenticated
  USING (public.current_staff_role() = 'owner')
  WITH CHECK (public.current_staff_role() = 'owner');
CREATE POLICY menu_items_owner_delete
  ON public.menu_items FOR DELETE TO authenticated
  USING (public.current_staff_role() = 'owner');

CREATE POLICY orders_staff_read
  ON public.orders FOR SELECT TO authenticated
  USING (public.current_staff_role() IN ('owner', 'cashier'));
CREATE POLICY order_items_staff_read
  ON public.order_items FOR SELECT TO authenticated
  USING (public.current_staff_role() IN ('owner', 'cashier'));

-- The server-side RPC is the only way staff can create an order. It verifies
-- the caller itself and performs all order writes atomically.
CREATE FUNCTION public.require_staff_for_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.current_staff_role() NOT IN ('owner', 'cashier') THEN
    RAISE EXCEPTION 'Only shop staff can create orders.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_require_staff
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.require_staff_for_order();

ALTER FUNCTION public.create_order(text, jsonb) SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.create_order(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(text, jsonb) TO authenticated;
