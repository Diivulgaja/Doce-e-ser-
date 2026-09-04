import type { ProductChoice, ProductOption } from "@/lib/types";

export function parseProductOptions(value: string | null | undefined): ProductOption[] {
  const source = value?.trim();
  if (!source) return [];
  try {
    const parsed: unknown = JSON.parse(source);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isProductOption);
  } catch {
    return [];
  }
}

export function optionSelectionCount(option: ProductOption) {
  return optionSelectionLimits(option).max;
}

export function optionSelectionLimits(option: ProductOption) {
  const available = Math.max(option.values.length, 1);
  if (option.kind === "combo" && option.selectionCount != null) {
    const exact = clampSelection(option.selectionCount, 1, available);
    return { min: exact, max: exact };
  }
  const defaultMin = option.kind === "addon" ? 0 : 1;
  const min = clampSelection(option.minSelections ?? defaultMin, 0, available);
  const max = clampSelection(option.maxSelections ?? option.selectionCount ?? 1, Math.max(min, 1), available);
  return { min, max };
}

export function choiceDetails(value: string | ProductChoice, index: number): ProductChoice {
  if (typeof value === "string") return { id: `legacy-${index}-${value}`, name: value };
  return {
    id: String(value.id || `choice-${index}`),
    name: String(value.name || ""),
    description: String(value.description || ""),
    imageUrl: String(value.imageUrl || ""),
    productId: Number(value.productId) > 0 ? Number(value.productId) : undefined,
    priceDelta: Number.isFinite(Number(value.priceDelta)) ? Math.max(0, Number(value.priceDelta)) : 0,
  };
}

export function choicePriceDelta(value: string | ProductChoice) {
  return typeof value === "string" ? 0 : Math.max(0, Number(value.priceDelta) || 0);
}

export function isComboOption(option: ProductOption) {
  return option.kind === "combo";
}

function isProductOption(value: unknown): value is ProductOption {
  if (!value || typeof value !== "object") return false;
  const option = value as Partial<ProductOption>;
  return typeof option.name === "string" && Array.isArray(option.values);
}

function clampSelection(value: unknown, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Math.max(minimum, Math.min(Number.isFinite(parsed) ? Math.floor(parsed) : minimum, maximum));
}
