CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price_centavos integer NOT NULL CHECK (price_centavos >= 0),
  category text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date),
  order_number integer NOT NULL DEFAULT 0, -- The insert trigger assigns the real value.
  customer_name text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'ready', 'completed', 'cancelled')),
  total_centavos integer NOT NULL DEFAULT 0 CHECK (total_centavos >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_date, order_number)
);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  unit_price_centavos integer NOT NULL CHECK (unit_price_centavos >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_id_idx ON public.order_items (order_id);

CREATE FUNCTION public.assign_daily_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    841137,
    NEW.order_date - DATE '2000-01-01'
  );

  SELECT COALESCE(MAX(order_number), 0) + 1
    INTO NEW.order_number
    FROM public.orders
   WHERE order_date = NEW.order_date;

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_assign_daily_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_daily_order_number();

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
