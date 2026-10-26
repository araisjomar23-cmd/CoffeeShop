INSERT INTO public.menu_items (name, price_centavos, category) VALUES
  ('Ice Spanish Latte (12 oz)', 4900, 'Coffee'),
  ('Ice Spanish Latte (16 oz)', 5900, 'Coffee'),
  ('Ice Latte (12 oz)', 4900, 'Coffee'),
  ('Ice Latte (16 oz)', 5900, 'Coffee'),
  ('Ice Caramel Macchiato (12 oz)', 4900, 'Coffee'),
  ('Ice Caramel Macchiato (16 oz)', 5900, 'Coffee'),
  ('Ice Americano (12 oz)', 4900, 'Coffee'),
  ('Ice Americano (16 oz)', 5900, 'Coffee'),
  ('Ice Matcha Latte (12 oz)', 4900, 'Coffee'),
  ('Ice Matcha Latte (16 oz)', 5900, 'Coffee');

NOTIFY pgrst, 'reload schema';
