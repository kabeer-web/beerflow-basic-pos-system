# BeerFlow POS 2.3.0 — Universal Restaurant Engine

## Implemented & tested

### Core engine (logic)
- Universal ModifierGroup / ModifierOption on every product
- Required / optional, single / multi, min / max selection validation
- Price adjustments from modifier options
- Ingredient add / remove linked to modifier options
- Flavour-specific recipes + half-and-half 50/50 consumption
- Adjustment recipes triggered by selected option IDs
- Prepared ingredients (`kind: "prepared"`) with productionRecipeId
- Batch production: preview, produce, reverse
- Circular recipe protection
- Weighted-average cost on production
- Full stock ledger for production movements
- Safe migration from v1 / v2.1 / v2.2 (normalizeState)
- Historical orders retain original config, prices and costs

### Data model
- Product.modifierGroups
- Ingredient.category, purchaseUnit, conversionFactor, kind, productionRecipeId
- Recipe.flavourName, requiredModifierOptionIds, isAdjustment
- ProductionBatch with reversal support
- AppState.productionBatches
- meta.version = 2

### Tests
- 49 automated tests, all passing
- Coverage includes: modifier pricing & validation, half-and-half, modifier stock deduction, production batch + reverse, circular protection, legacy normalization, all previous v2.1 scenarios

## Partially complete / UI remaining

The business logic and data model for the universal engine are complete and tested.
The existing management UI (books.tsx / menu.tsx) still primarily exposes the legacy
size / flavour / addon forms. Full visual builders for:

- Drag-and-drop modifier group editor
- Visual recipe cost breakdown panel
- Production batch wizard screen
- Advanced ingredient category filters

are not yet wired into the React components. Owners can already use the new fields
via the data model and any future UI will light up automatically because the POS
cart, pricing and consumption paths already understand modifierSelections.

## How to use (owner)

1. Simple item → base price only.
2. Sizes / flavours → existing fields; attach size- or flavour-specific recipes.
3. Complex build (burger, pizza toppings, spice, shots) → populate product.modifierGroups.
4. Prepared sauce / dough / marinade → create ingredient with kind "prepared",
   attach a production recipe, then call produceBatch.
5. Recipes:
   - Base / size → flavourName blank
   - Flavour-specific → set flavourName
   - Modifier-driven → isAdjustment + requiredModifierOptionIds

## Verification

```
node --experimental-strip-types --test src/lib/pos/logic.test.ts
→ 49 tests, 49 pass
```

npm install / full tsc / production build may require network access to the registry.
