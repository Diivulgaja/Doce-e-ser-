export type Category = { id: number; name: string; slug: string; sortOrder: number; active: boolean };
export type ProductChoice = { id: string; name: string; description?: string; imageUrl?: string };
export type ProductOption = { kind?: "simple" | "combo"; name: string; description?: string; selectionCount?: number; values: Array<string | ProductChoice> };
export type Product = { id: number; categoryId: number; name: string; description: string; price: number; imageUrl: string; optionsJson: string; active: boolean; soldOut: boolean; featured: boolean; sortOrder: number };
export type Settings = { id: number; storeName: string; phone: string; whatsapp: string; instagram: string; address: string; mapsUrl: string; openTime: string; closeTime: string; intervalMinutes: number; ordersPerSlot: number; closedDaysJson: string; prepMinutes: number; paymentMethodsJson: string };
export type OrderItem = { id?: number; productId: number; productName: string; quantity: number; unitPrice: number; optionsJson?: string; selectedOptions?: string[]; notes?: string };
export type Order = { id: number; orderNumber: string; customerName: string; phone: string; pickupDate: string; pickupTime: string; notes: string; paymentMethod: string; status: string; total: number; createdAt: string; items: OrderItem[] };
export type Catalog = { categories: Category[]; products: Product[]; settings: Settings };
