import Image from "next/image";

const productPhotos: Record<string, string> = {
  "Ice Spanish Latte": "ice-spanish-latte",
  "Ice Latte": "ice-latte",
  "Ice Caramel Macchiato": "ice-caramel-macchiato",
  "Ice Americano": "ice-americano",
  "Ice Matcha Latte": "ice-matcha-latte",
  "Red Velvet": "milk-tea-red-velvet-light",
  "Chocolate": "milk-tea-chocolate-light",
  "Cookies & Cream": "milk-tea-cookies-cream-light",
  "Okinawa": "milk-tea-okinawa-light",
  "Wintermelon": "milk-tea-wintermelon-light",
  "Mango Cheesecake": "milk-tea-mango-cheesecake-light",
  "Matcha": "milk-tea-matcha-light",
  "Fries Overload": "fries-overload-light",
  "Cheese Overload Nachos": "cheese-overload-nachos-light",
  "Nachos Cheese Overload": "cheese-overload-nachos-light",
  "Combo Meal": "combo-meal-light",
  "Combo Meal - Burger, Fries & Milk Tea": "combo-meal-light",
  "Regular Burger": "regular-burger-light",
  "Cheesy Burger": "cheesy-burger-light",
  "Egg Burger": "egg-burger-light",
  "Overload Burger": "overload-burger-light",
};

export default function ProductPhoto({ name, thumbnail = false }: { name: string; thumbnail?: boolean }) {
  const flavor = name.replace(/^Milk Tea - /, "").replace(/ \((?:12|16) oz\)$/, "");
  const photo = productPhotos[flavor];
  if (!photo) return null;
  const isFood = photo === "fries-overload-light" || photo === "cheese-overload-nachos-light" || photo === "combo-meal-light" || photo.endsWith("-burger-light");

  return (
    <Image
      src={`/menu/${photo}.webp`}
      alt={flavor}
      width={isFood ? 640 : 180}
      height={isFood ? 640 : 250}
      sizes={thumbnail ? "56px" : "(max-width: 379px) 80vw, (max-width: 767px) 40vw, 240px"}
      className={thumbnail
        ? "float-left mr-3 h-16 w-14 rounded-lg object-cover"
        : `mb-4 w-full rounded-xl bg-[#eeeae1] object-contain ${isFood ? "aspect-square h-auto" : "h-44 sm:h-48"}`}
    />
  );
}
