-- The category already names Milk Tea, so keep product labels short and
-- group their size choices together in the cashier screen.
UPDATE public.menu_items
   SET name = regexp_replace(name, '^Milk Tea - ', '')
 WHERE category = 'Milk Tea'
   AND name LIKE 'Milk Tea - %';

UPDATE public.menu_items SET name = 'Combo Meal'
 WHERE category = 'Combos'
   AND name = 'Combo Meal - Burger, Fries & Milk Tea';

UPDATE public.menu_items SET name = 'Pearl'
 WHERE category = 'Add-ons'
   AND name = 'Milk Tea Add-on - Pearl';

UPDATE public.menu_items SET name = 'Lettuce'
 WHERE category = 'Add-ons'
   AND name = 'Burger Add-on - Lettuce';

UPDATE public.menu_items SET name = 'Cheese'
 WHERE category = 'Add-ons'
   AND name = 'Burger Add-on - Cheese';

UPDATE public.menu_items SET name = 'Egg'
 WHERE category = 'Add-ons'
   AND name = 'Burger Add-on - Egg';

NOTIFY pgrst, 'reload schema';
