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
  const requested = Number(option.selectionCount ?? 1);
  const available = option.values.length;
  return Math.max(1, Math.min(Number.isFinite(requested) ? Math.floor(requested) : 1, Math.max(available, 1)));
}

export function choiceDetails(value: string | ProductChoice, index: number): ProductChoice {
  if (typeof value === "string") return { id: `legacy-${index}-${value}`, name: value };
  return {
    id: String(value.id || `choice-${index}`),
    name: String(value.name || ""),
    description: String(value.description || ""),
    imageUrl: String(value.imageUrl || ""),
  };
}

export function isComboOption(option: ProductOption) {
  return option.kind === "combo";
}

function isProductOption(value: unknown): value is ProductOption {
  if (!value || typeof value !== "object") return false;
  const option = value as Partial<ProductOption>;
  return typeof option.name === "string" && Array.isArray(option.values);
}
