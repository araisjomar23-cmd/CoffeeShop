-- TEMPORARY DEV ACCESS - REMOVE BEFORE REAL CLIENT DATA. Replace with staff-login policies.

CREATE POLICY menu_items_dev_select
  ON public.menu_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY menu_items_dev_insert
  ON public.menu_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY menu_items_dev_update
  ON public.menu_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY menu_items_dev_delete
  ON public.menu_items FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY orders_dev_select
  ON public.orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY orders_dev_insert
  ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY orders_dev_update
  ON public.orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY orders_dev_delete
  ON public.orders FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY order_items_dev_select
  ON public.order_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY order_items_dev_insert
  ON public.order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY order_items_dev_update
  ON public.order_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY order_items_dev_delete
  ON public.order_items FOR DELETE TO anon, authenticated USING (true);
