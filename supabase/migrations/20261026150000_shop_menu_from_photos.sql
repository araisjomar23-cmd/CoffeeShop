-- Replace the development sample menu with the items and prices visible in
-- the shop's menu photos. Disable old products so historical orders remain intact.
WITH development_items(name, price_centavos, category) AS (
  VALUES
    ('Espresso', 9000, 'Drinks'),
    ('Americano', 11000, 'Drinks'),
    ('Cafe Latte', 15000, 'Drinks'),
    ('Cappuccino', 15000, 'Drinks'),
    ('Mocha', 17000, 'Drinks'),
    ('Iced Latte', 16000, 'Drinks'),
    ('Cold Brew', 16000, 'Drinks'),
    ('Butter Croissant', 12000, 'Pastries'),
    ('Blueberry Muffin', 11000, 'Pastries'),
    ('Banana Bread', 10000, 'Pastries')
)
UPDATE public.menu_items AS menu_item
   SET is_active = false
  FROM development_items AS sample
 WHERE menu_item.name = sample.name
   AND menu_item.price_centavos = sample.price_centavos
   AND menu_item.category = sample.category
   AND menu_item.is_active;

INSERT INTO public.menu_items (name, price_centavos, category) VALUES
  ('Milk Tea - Red Velvet (12 oz)', 2900, 'Milk Tea'),
  ('Milk Tea - Red Velvet (16 oz)', 3900, 'Milk Tea'),
  ('Milk Tea - Chocolate (12 oz)', 2900, 'Milk Tea'),
  ('Milk Tea - Chocolate (16 oz)', 3900, 'Milk Tea'),
  ('Milk Tea - Cookies & Cream (12 oz)', 2900, 'Milk Tea'),
  ('Milk Tea - Cookies & Cream (16 oz)', 3900, 'Milk Tea'),
  ('Milk Tea - Okinawa (12 oz)', 2900, 'Milk Tea'),
  ('Milk Tea - Okinawa (16 oz)', 3900, 'Milk Tea'),
  ('Milk Tea - Wintermelon (12 oz)', 2900, 'Milk Tea'),
  ('Milk Tea - Wintermelon (16 oz)', 3900, 'Milk Tea'),
  ('Milk Tea - Mango Cheesecake (12 oz)', 2900, 'Milk Tea'),
  ('Milk Tea - Mango Cheesecake (16 oz)', 3900, 'Milk Tea'),
  ('Milk Tea - Matcha (12 oz)', 2900, 'Milk Tea'),
  ('Milk Tea - Matcha (16 oz)', 3900, 'Milk Tea'),
  ('Regular Burger', 5900, 'Burgers'),
  ('Cheesy Burger', 6900, 'Burgers'),
  ('Egg Burger', 7900, 'Burgers'),
  ('Overload Burger', 8900, 'Burgers'),
  ('Fries Overload', 7000, 'Sides'),
  ('Cheese Overload Nachos', 7000, 'Sides'),
  ('Combo Meal - Burger, Fries & Milk Tea', 9900, 'Combos'),
  ('Milk Tea Add-on - Pearl', 1000, 'Add-ons'),
  ('Burger Add-on - Lettuce', 1000, 'Add-ons'),
  ('Burger Add-on - Cheese', 1000, 'Add-ons'),
  ('Burger Add-on - Egg', 1000, 'Add-ons');

NOTIFY pgrst, 'reload schema';
