-- Use a non-null sentinel so PL/pgSQL authorization checks fail closed when
-- an authenticated user does not have a staff profile.
CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((
    SELECT staff_profiles.role
      FROM public.staff_profiles AS staff_profiles
     WHERE staff_profiles.user_id = auth.uid()
  ), 'none')
$$;

CREATE FUNCTION public.transition_order(p_order_id uuid, p_next_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current_status text;
BEGIN
  IF public.current_staff_role() NOT IN ('owner', 'cashier') THEN
    RAISE EXCEPTION 'Only shop staff can update preparation status.';
  END IF;

  IF p_next_status NOT IN ('ready', 'completed', 'new') THEN
    RAISE EXCEPTION 'Unsupported order status.';
  END IF;

  SELECT status INTO v_current_status
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order was not found.';
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

REVOKE ALL ON FUNCTION public.transition_order(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
