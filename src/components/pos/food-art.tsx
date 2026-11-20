import type { ReactNode } from "react";
import type { Deal, Product } from "@/lib/pos/types";

/**
 * Vector food illustrations used when an item or deal has no uploaded photo.
 * Every glyph is drawn in a 100x100 box so it can be placed on its own or
 * composed into a deal picture.
 */

export type FoodKind =
  | "pizza"
  | "fries"
  | "pasta"
  | "lasagna"
  | "drink"
  | "burger"
  | "chicken"
  | "bread"
  | "dessert"
  | "dish";

export function foodKind(name: string, type?: string): FoodKind {
  const text = name.toLowerCase();
  if (/fries|chips/.test(text)) return "fries";
  if (/lasagn/.test(text)) return "lasagna";
  if (/pasta|spaghetti|noodle|macaroni|penne/.test(text)) return "pasta";
  if (/burger|sandwich|shawarma|wrap|roll|zinger/.test(text)) return "burger";
  if (/wing|nugget|chicken|broast|drumstick|fried/.test(text) && !/pizza/.test(text)) return "chicken";
  if (/garlic|bread|bun|naan|paratha/.test(text)) return "bread";
  if (/cake|brownie|ice ?cream|dessert|sweet|kulfi/.test(text)) return "dessert";
  if (/drink|cola|pepsi|coke|sprite|fanta|7up|juice|water|shake|coffee|tea|lassi|soda/.test(text)) return "drink";
  if (/pizza/.test(text)) return "pizza";
  if (type === "pizza") return "pizza";
  if (type === "drink") return "drink";
  return "dish";
}

function Pizza() {
  const pepperoni: [number, number][] = [
    [38, 36],
    [62, 36],
    [68, 56],
    [50, 66],
    [32, 58],
    [50, 48],
  ];
  const olives: [number, number][] = [
    [46, 34],
    [58, 58],
    [38, 50],
    [64, 46],
  ];
  const peppers: [number, number][] = [
    [54, 36],
    [42, 62],
    [66, 64],
  ];
  return (
    <g>
      <ellipse cx="52" cy="92" rx="34" ry="5" fill="#000" opacity="0.25" />
      <circle cx="50" cy="50" r="44" fill="#d9993a" stroke="#a8691f" strokeWidth="2" />
      <circle cx="50" cy="50" r="38" fill="#c43a27" />
      <circle cx="50" cy="50" r="35" fill="#f5cd5f" />
      <path d="M22 44c6-4 10 2 16-2M60 28c4 4 10 0 14 4M30 70c6 2 8-4 14-2M62 74c5-2 9 2 13-3" stroke="#e7b23f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {pepperoni.map(([x, y], index) => (
        <g key={`p${index}`}>
          <circle cx={x} cy={y} r="7" fill="#b3271f" />
          <circle cx={x - 2} cy={y - 2} r="1.2" fill="#7e1912" />
          <circle cx={x + 2} cy={y + 2} r="1.2" fill="#7e1912" />
        </g>
      ))}
      {olives.map(([x, y], index) => (
        <g key={`o${index}`}>
          <circle cx={x} cy={y} r="3.2" fill="#2b2118" />
          <circle cx={x} cy={y} r="1.1" fill="#f5cd5f" />
        </g>
      ))}
      {peppers.map(([x, y], index) => (
        <circle key={`g${index}`} cx={x} cy={y} r="3.6" fill="none" stroke="#3f9b4a" strokeWidth="2" />
      ))}
      <g stroke="#a8691f" strokeWidth="1.4" opacity="0.55">
        <line x1="50" y1="50" x2="50" y2="12" />
        <line x1="50" y1="50" x2="50" y2="88" />
        <line x1="50" y1="50" x2="12" y2="50" />
        <line x1="50" y1="50" x2="88" y2="50" />
        <line x1="50" y1="50" x2="23" y2="23" />
        <line x1="50" y1="50" x2="77" y2="77" />
        <line x1="50" y1="50" x2="77" y2="23" />
        <line x1="50" y1="50" x2="23" y2="77" />
      </g>
    </g>
  );
}

function Fries() {
  const sticks = [22, 30, 38, 46, 54, 62, 70];
  return (
    <g>
      <ellipse cx="50" cy="93" rx="30" ry="4" fill="#000" opacity="0.25" />
      {sticks.map((x, index) => (
        <rect key={x} x={x} y={14 + (index % 3) * 5} width="8" height="46" rx="2" fill={index % 2 ? "#f2c23a" : "#f7d25c"} transform={`rotate(${(index - 3) * 4} ${x + 4} 60)`} />
      ))}
      <path d="M20 54h60l-6 38H26z" fill="#d63a2f" />
      <path d="M22 62h56l-1 8H23z" fill="#f7f1e6" />
      <path d="M38 76q12-8 24 0" stroke="#f5c518" strokeWidth="4" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Drink() {
  return (
    <g>
      <ellipse cx="50" cy="94" rx="24" ry="4" fill="#000" opacity="0.25" />
      <path d="M58 26L66 6" stroke="#f5c518" strokeWidth="5" strokeLinecap="round" />
      <path d="M28 30h44l-6 62H34z" fill="#d63a2f" />
      <path d="M30 46h40l-1.6 16H31.6z" fill="#f7f1e6" />
      <circle cx="50" cy="54" r="5" fill="#d63a2f" />
      <rect x="25" y="24" width="50" height="9" rx="4" fill="#f7f1e6" />
      <circle cx="42" cy="76" r="2.4" fill="#fff" opacity="0.5" />
      <circle cx="56" cy="72" r="1.8" fill="#fff" opacity="0.5" />
    </g>
  );
}

function Pasta() {
  return (
    <g>
      <ellipse cx="50" cy="92" rx="36" ry="4" fill="#000" opacity="0.25" />
      <path d="M12 52h76c0 22-14 36-38 36S12 74 12 52z" fill="#f7f1e6" />
      <path d="M12 52h76" stroke="#d9d1c0" strokeWidth="2" />
      <ellipse cx="50" cy="50" rx="34" ry="14" fill="#f1cd6e" />
      <g stroke="#e0b24d" strokeWidth="2.4" fill="none" strokeLinecap="round">
        <path d="M22 48c8-8 14 6 22-2s12 6 20-2 10 4 14-1" />
        <path d="M26 54c8-6 14 6 22 0s12 4 20-2" />
        <path d="M30 44c8-6 14 4 22-2s10 2 16-1" />
      </g>
      <path d="M32 44c10-8 26-8 36 0-4 8-30 8-36 0z" fill="#c43a27" />
      <circle cx="44" cy="44" r="2" fill="#e8685a" />
      <circle cx="58" cy="45" r="2" fill="#e8685a" />
      <path d="M48 36c4-8 12-8 14-2-6 0-10 2-14 2z" fill="#3f9b4a" />
    </g>
  );
}

function Lasagna() {
  return (
    <g>
      <ellipse cx="50" cy="90" rx="38" ry="5" fill="#000" opacity="0.25" />
      <ellipse cx="50" cy="82" rx="40" ry="8" fill="#f7f1e6" />
      <path d="M22 40h56l6 36H16z" fill="#f1cd6e" />
      <path d="M20 52h60l1.5 8h-63z" fill="#c43a27" />
      <path d="M19 62h62l1.5 8h-65z" fill="#f7e29a" />
      <path d="M18 70h64l1.5 6h-67z" fill="#c43a27" />
      <path d="M22 40h56l1.2 8h-58.4z" fill="#f5cd5f" />
      <path d="M26 40c4 6 6-2 10 4s8-4 12 3 8-5 12 2 8-4 12 1" stroke="#e7b23f" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M46 30c4-8 12-8 14-2-6 0-10 2-14 2z" fill="#3f9b4a" />
      <path d="M40 34c2-6 8-6 10-2-4 0-7 2-10 2z" fill="#3f9b4a" />
    </g>
  );
}

function Burger() {
  return (
    <g>
      <ellipse cx="50" cy="92" rx="34" ry="4" fill="#000" opacity="0.25" />
      <path d="M16 46c0-22 16-32 34-32s34 10 34 32z" fill="#d9993a" />
      <g fill="#f7e29a">
        <ellipse cx="36" cy="28" rx="3" ry="1.6" />
        <ellipse cx="52" cy="22" rx="3" ry="1.6" />
        <ellipse cx="66" cy="30" rx="3" ry="1.6" />
      </g>
      <path d="M12 48c6-4 8 4 14 0s8 4 14 0 8 4 14 0 8 4 14 0 8 4 14 0v6H12z" fill="#4ea04a" />
      <path d="M14 54h72l-8 10H22z" fill="#f2b52e" />
      <rect x="14" y="62" width="72" height="12" rx="6" fill="#6b3a22" />
      <path d="M16 76h68c0 10-8 14-18 14H34c-10 0-18-4-18-14z" fill="#d9993a" />
    </g>
  );
}

function Chicken() {
  return (
    <g>
      <ellipse cx="50" cy="92" rx="32" ry="4" fill="#000" opacity="0.25" />
      <path d="M66 62l14 14" stroke="#f7f1e6" strokeWidth="7" strokeLinecap="round" />
      <circle cx="84" cy="74" r="5" fill="#f7f1e6" />
      <circle cx="78" cy="82" r="5" fill="#f7f1e6" />
      <path d="M18 46c0-18 16-30 32-26s24 20 16 36-24 14-34 8S18 56 18 46z" fill="#c9792d" />
      <path d="M26 40c4-8 12-12 20-12" stroke="#e6a14e" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="52" r="2" fill="#a85d1e" />
      <circle cx="54" cy="44" r="2" fill="#a85d1e" />
      <circle cx="56" cy="58" r="2" fill="#a85d1e" />
    </g>
  );
}

function Bread() {
  return (
    <g>
      <ellipse cx="50" cy="90" rx="38" ry="5" fill="#000" opacity="0.25" />
      <path d="M12 54c0-18 18-28 38-28s38 10 38 28c0 8-4 14-10 16H22c-6-2-10-8-10-16z" fill="#e0a64b" />
      <path d="M22 42l8 20M40 36l8 26M58 36l8 26M72 42l8 20" stroke="#b9772a" strokeWidth="3.5" strokeLinecap="round" />
      <g fill="#f4e6a8">
        <circle cx="30" cy="48" r="1.8" />
        <circle cx="52" cy="42" r="1.8" />
        <circle cx="70" cy="50" r="1.8" />
      </g>
      <path d="M22 70h56l-4 12H26z" fill="#c9792d" />
    </g>
  );
}

function Dessert() {
  return (
    <g>
      <ellipse cx="50" cy="94" rx="20" ry="3.5" fill="#000" opacity="0.25" />
      <path d="M32 46h36L50 92z" fill="#e0a64b" />
      <path d="M38 52l22 22M46 50l14 14M32 46l14 24" stroke="#b9772a" strokeWidth="1.6" />
      <circle cx="50" cy="38" r="18" fill="#f3a7b8" />
      <circle cx="42" cy="26" r="12" fill="#f7f1e6" />
      <circle cx="60" cy="26" r="12" fill="#7a4a2b" />
      <circle cx="51" cy="12" r="4.5" fill="#d63a2f" />
    </g>
  );
}

function Dish() {
  return (
    <g>
      <ellipse cx="50" cy="90" rx="38" ry="5" fill="#000" opacity="0.25" />
      <path d="M14 78c0-26 16-40 36-40s36 14 36 40z" fill="#d8dde3" />
      <path d="M22 70c2-16 12-26 28-26" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
      <circle cx="50" cy="34" r="5" fill="#b9c0c9" />
      <rect x="8" y="78" width="84" height="7" rx="3.5" fill="#aab2bc" />
    </g>
  );
}

const GLYPHS: Record<FoodKind, () => ReactNode> = {
  pizza: Pizza,
  fries: Fries,
  pasta: Pasta,
  lasagna: Lasagna,
  drink: Drink,
  burger: Burger,
  chicken: Chicken,
  bread: Bread,
  dessert: Dessert,
  dish: Dish,
};

function Glyph({ kind }: { kind: FoodKind }) {
  const Draw = GLYPHS[kind];
  return <Draw />;
}

/** Soft terracotta-amber glow behind the food — warm cafe palette. */
function Backdrop({ width, height }: { width: number; height: number }) {
  const r = Math.min(width, height) * 0.48;
  return (
    <>
      <defs>
        <radialGradient id="bf-food-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#E07A3D" stopOpacity="0.42" />
          <stop offset="0.65" stopColor="#C45D2A" stopOpacity="0.2" />
          <stop offset="1" stopColor="#F0B429" stopOpacity="0.05" />
        </radialGradient>
      </defs>
      <circle cx={width / 2} cy={height / 2} r={r} fill="url(#bf-food-glow)" />
      <circle cx={width / 2} cy={height / 2} r={r} fill="none" stroke="#F0B429" strokeOpacity="0.22" strokeWidth="0.8" />
    </>
  );
}

/** A single menu item drawn as a vector picture. */
export function ProductArt({ name, type, className }: { name: string; type?: string; className?: string }) {
  const kind = foodKind(name, type);
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={name}>
      <title>{name}</title>
      <Backdrop width={100} height={100} />
      <g transform="translate(10 8) scale(0.8)">
        <Glyph kind={kind} />
      </g>
    </svg>
  );
}

const SIZE_SCALE: Record<string, number> = { small: 0.82, regular: 0.92, medium: 0.92, large: 1, jumbo: 1.1 };

interface DealPart {
  kind: FoodKind;
  qty: number;
  scale: number;
}

function dealParts(deal: Deal, products: Product[]): DealPart[] {
  const parts: DealPart[] = [];
  for (const slot of deal.slots) {
    if (slot.mode === "pizza") {
      const scale = SIZE_SCALE[(slot.sizeName ?? "regular").toLowerCase()] ?? 0.92;
      for (let index = 0; index < slot.qty; index += 1) parts.push({ kind: "pizza", qty: 1, scale });
      continue;
    }
    const id = slot.mode === "choice" ? slot.choiceProductIds[0] : slot.productId;
    const product = products.find((item) => item.id === id);
    const kind = foodKind(`${product?.name ?? ""} ${slot.label}`, product?.type);
    if (kind === "pizza") {
      for (let index = 0; index < slot.qty; index += 1) parts.push({ kind: "pizza", qty: 1, scale: 0.92 });
    } else {
      parts.push({ kind, qty: slot.qty, scale: 1 });
    }
  }
  return parts;
}

/** A deal drawn from what is inside it: pizzas in the middle, sides and drinks beside them. */
export function DealArt({ deal, products, className }: { deal: Deal; products: Product[]; className?: string }) {
  const parts = dealParts(deal, products);
  const pizzas = parts.filter((part) => part.kind === "pizza").slice(0, 4);
  const extraKinds: FoodKind[] = [];
  for (const part of parts) {
    if (part.kind !== "pizza" && !extraKinds.includes(part.kind)) extraKinds.push(part.kind);
  }
  const extras = extraKinds.slice(0, 3);
  const W = 160;
  const H = 100;
  const areaW = extras.length > 0 ? 108 : W;
  const base = pizzas.length <= 1 ? 90 : pizzas.length === 2 ? 66 : pizzas.length === 3 ? 58 : 50;
  const places: [number, number][] =
    pizzas.length === 1
      ? [[0.5, 0.5]]
      : pizzas.length === 2
        ? [[0.3, 0.42], [0.7, 0.58]]
        : pizzas.length === 3
          ? [[0.28, 0.34], [0.72, 0.34], [0.5, 0.7]]
          : [[0.28, 0.3], [0.72, 0.3], [0.28, 0.72], [0.72, 0.72]];
  const extraSize = extras.length === 1 ? 62 : extras.length === 2 ? 48 : 36;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={deal.title}>
      <title>{deal.title}</title>
      <Backdrop width={W} height={H} />
      {pizzas.map((part, index) => {
        const size = base * part.scale;
        const [px, py] = places[index] ?? [0.5, 0.5];
        const x = px * areaW - size / 2;
        const y = py * H - size / 2;
        return (
          <g key={index} transform={`translate(${x} ${y}) scale(${size / 100})`}>
            <Glyph kind="pizza" />
          </g>
        );
      })}
      {extras.map((kind, index) => {
        const slotH = H / extras.length;
        const x = areaW + (W - areaW - extraSize) / 2;
        const y = index * slotH + (slotH - extraSize) / 2;
        return (
          <g key={kind} transform={`translate(${x} ${y}) scale(${extraSize / 100})`}>
            <Glyph kind={kind} />
          </g>
        );
      })}
    </svg>
  );
}

/** Uploaded photo when there is one, otherwise the vector picture. */
export function ProductPicture({
  product,
  url,
  className,
  imgClassName,
}: {
  product: Product;
  url?: string | null;
  className?: string;
  imgClassName?: string;
}) {
  if (url) return <img src={url} alt="" className={imgClassName ?? className} />;
  return <ProductArt name={product.name} type={product.type} className={className} />;
}

export function DealPicture({
  deal,
  products,
  url,
  className,
  imgClassName,
}: {
  deal: Deal;
  products: Product[];
  url?: string | null;
  className?: string;
  imgClassName?: string;
}) {
  if (url) return <img src={url} alt="" className={imgClassName ?? className} />;
  return <DealArt deal={deal} products={products} className={className} />;
}
