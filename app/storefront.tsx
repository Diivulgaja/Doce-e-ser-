"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AtSign, Check, ChevronRight, Clock3, MapPin, MessageCircle, Minus, Plus, Search, ShoppingBag, Sparkles, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ProductImage from "@/components/product-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import type { Catalog, Order, Product, ProductOption } from "@/lib/types";
import { choiceDetails, isComboOption, optionSelectionCount, parseProductOptions } from "@/lib/product-options";
import { getSupabaseBrowser } from "@/lib/supabase";

type CartLine = { product: Product; quantity: number; selectedOptions: string[]; notes: string };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const statusLabels: Record<string, string> = { received: "Pedido recebido", confirmed: "Confirmado", preparing: "Em preparação", ready: "Pronto para retirada", picked_up: "Retirado", cancelled: "Cancelado" };
const primaryButton = "rounded-full bg-gradient-to-r from-[#4a2110] via-[#6b351b] to-[#4a2110] font-semibold text-[#fff8ed] shadow-[0_10px_28px_rgba(74,33,16,.24)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(74,33,16,.32)] active:translate-y-0";
const secondaryButton = "rounded-full border border-[#8b674e]/30 bg-white/80 font-semibold text-[#512b18] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8b674e]/50 hover:bg-white hover:shadow-md active:translate-y-0";

export default function Storefront() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [category, setCategory] = useState("todos");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[][]>([]);
  const [productNotes, setProductNotes] = useState("");
  const [checkout, setCheckout] = useState(false);
  const [confirmation, setConfirmation] = useState<Order | null>(null);
  const [tracking, setTracking] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadCatalog = useCallback(async (background = false) => {
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      const next = await response.json();
      if (!response.ok || next.error) throw new Error(next.error || "Não foi possível carregar o cardápio agora.");
      setCatalog(next);
      setLoadError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível carregar o cardápio agora.";
      setLoadError(message);
      if (!background) toast.error(message);
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadCatalog());
    const refresh = () => loadCatalog(true);
    const timer = window.setInterval(refresh, 15000);
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    const supabase = getSupabaseBrowser();
    const channel = supabase?.channel("storefront-catalog")
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "store_settings" }, refresh)
      .subscribe();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      if (channel) supabase?.removeChannel(channel);
    };
  }, [loadCatalog]);

  const visibleProducts = useMemo(() => (catalog?.products ?? []).filter((product) => {
    const matchesCategory = category === "todos" || String(product.categoryId) === category;
    const matchesQuery = product.name.toLowerCase().includes(query.toLowerCase());
    return product.active && matchesCategory && matchesQuery;
  }), [catalog, category, query]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  function openProduct(product: Product) {
    const options = parseProductOptions(product.optionsJson);
    setSelectedProduct(product);
    setSelectedOptions(options.map(() => []));
    setProductNotes("");
  }

  function addSelectedProduct() {
    if (!selectedProduct) return;
    const options = parseProductOptions(selectedProduct.optionsJson);
    const incomplete = options.findIndex((option, index) => (selectedOptions[index]?.length ?? 0) !== optionSelectionCount(option));
    if (incomplete >= 0) {
      const option = options[incomplete];
      const required = optionSelectionCount(option);
      return toast.error(`Escolha ${required} ${required === 1 ? "opção" : "opções"} em “${option.name}”.`);
    }
    const selections = options.flatMap((option, index) => (selectedOptions[index] ?? []).map((value) => `${option.name}: ${value}`));
    setCart((current) => [...current, { product: selectedProduct, quantity: 1, selectedOptions: selections, notes: productNotes }]);
    setSelectedProduct(null);
    setCartOpen(true);
    toast.success("Produto adicionado ao carrinho.");
  }

  function updateQuantity(index: number, amount: number) {
    setCart((current) => current.flatMap((item, itemIndex) => itemIndex === index ? (item.quantity + amount > 0 ? [{ ...item, quantity: item.quantity + amount }] : []) : [item]));
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#fbf7f0]"><div className="text-center"><Image src="/assets/logo-doce-e-ser.png" alt="Doce é Ser" width={112} height={112} className="mx-auto rounded-full" /><p className="mt-4 text-[#7a5d49]">Preparando o cardápio…</p></div></main>;
  if (!catalog) return <main className="grid min-h-screen place-items-center bg-[#fbf7f0] p-6 text-center text-[#3c2419]"><div className="max-w-lg rounded-3xl border border-[#6a3d24]/10 bg-white p-7 shadow-sm"><h1 className="font-serif text-3xl">Não foi possível carregar o cardápio</h1><p className="mt-3 text-[#806b5d]">{loadError || "Confira a conexão com o Supabase."}</p><p className="mt-4 rounded-xl bg-[#f2e4d2] p-3 text-sm">Confirme no arquivo <strong>.env.local</strong> as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY, depois reinicie o servidor.</p></div></main>;

  const settings = catalog.settings;
  const productOptions = selectedProduct ? parseProductOptions(selectedProduct.optionsJson) : [];
  const productIsCombo = productOptions.some(isComboOption);
  return (
    <div className="min-h-screen bg-[#fbf7f0] text-[#3c2419]">
      <Toaster position="top-center" richColors />
      <header className="sticky top-0 z-40 border-b border-[#6a3d24]/10 bg-[#fbf7f0]/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center gap-5 px-4 sm:px-6">
          <a href="#inicio" className="flex items-center gap-3"><Image src="/assets/logo-doce-e-ser.png" width={52} height={52} alt={settings.storeName} className="rounded-full shadow-sm" /><span className="hidden font-serif text-xl font-semibold sm:inline">{settings.storeName}</span></a>
          <nav className="ml-auto hidden items-center gap-6 text-sm font-medium lg:flex">
            <a href="#inicio" className="transition hover:text-[#8b4d2c]">Início</a><a href="#cardapio" className="transition hover:text-[#8b4d2c]">Cardápio</a><button onClick={() => setTracking(true)} className="transition hover:text-[#8b4d2c]">Meus pedidos</button><a href="#loja" className="transition hover:text-[#8b4d2c]">Informações da loja</a>
          </nav>
          <Button onClick={() => setCartOpen(true)} className={`ml-auto h-11 px-4 lg:ml-2 ${primaryButton}`}><ShoppingBag /> <span className="hidden sm:inline">Carrinho</span><span className="grid size-6 place-items-center rounded-full bg-[#f4d5a6] text-xs text-[#5b2c16]">{cartCount}</span></Button>
        </div>
      </header>

      <main>
        <section id="inicio" className="relative overflow-hidden border-b border-[#6a3d24]/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,#eed3aa_0,transparent_35%),radial-gradient(circle_at_10%_90%,#ead8c3_0,transparent_28%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_.82fr] lg:py-24">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#be9b73]/40 bg-white/55 px-3 py-2 text-sm text-[#75513b]"><Store className="size-4" /> Pedidos somente para retirada</div>
              <h1 className="max-w-3xl font-serif text-5xl leading-[.98] tracking-[-.035em] text-[#4e2715] sm:text-7xl">Um doce momento para chamar de seu.</h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#765846]">Doces e bolos artesanais, preparados com carinho para você retirar na nossa loja.</p>
              <div className="mt-8 flex flex-wrap gap-3"><Button asChild size="lg" className={`h-13 px-7 text-base ${primaryButton}`}><a href="#cardapio">Ver cardápio <ChevronRight /></a></Button><Button variant="outline" size="lg" onClick={() => setTracking(true)} className={`h-13 px-7 text-base ${secondaryButton}`}>Acompanhar pedido</Button></div>
            </div>
            <div className="relative mx-auto aspect-square w-full max-w-[470px] overflow-hidden rounded-[2.5rem] border-8 border-white/60 shadow-2xl shadow-[#6b3a20]/15"><ProductImage src="sprite:0" alt="Fatia de bolo de chocolate" className="absolute inset-0 h-full w-full" /><div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-[#fffaf4]/90 p-4 backdrop-blur"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#9b6f4f]">Feito artesanalmente</p><p className="mt-1 font-serif text-xl">Chocolate, afeto e bons ingredientes.</p></div></div>
          </div>
        </section>

        <section id="cardapio" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold uppercase tracking-[.2em] text-[#a16e48]">Escolha o seu</p><h2 className="mt-2 font-serif text-4xl sm:text-5xl">Nosso cardápio</h2></div><label className="flex h-12 items-center gap-3 rounded-full border border-[#6a3d24]/15 bg-white px-4 shadow-sm md:w-80"><Search className="size-5 text-[#9a7d68]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar no cardápio" className="w-full bg-transparent outline-none" /></label></div>
          <div className="scrollbar-none -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <button onClick={() => setCategory("todos")} className={`whitespace-nowrap rounded-full px-5 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 ${category === "todos" ? "bg-gradient-to-r from-[#4a2110] to-[#6b351b] text-white shadow-lg shadow-[#5b2c16]/20" : "border border-[#6a3d24]/15 bg-white shadow-sm hover:border-[#8b674e]/35 hover:shadow-md"}`}>Todos</button>
            {catalog.categories.filter((item) => item.active).map((item) => <button key={item.id} onClick={() => setCategory(String(item.id))} className={`whitespace-nowrap rounded-full px-5 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 ${category === String(item.id) ? "bg-gradient-to-r from-[#4a2110] to-[#6b351b] text-white shadow-lg shadow-[#5b2c16]/20" : "border border-[#6a3d24]/15 bg-white shadow-sm hover:border-[#8b674e]/35 hover:shadow-md"}`}>{item.name}</button>)}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {visibleProducts.map((product) => <article key={product.id} className="group overflow-hidden rounded-3xl border border-[#6a3d24]/10 bg-white shadow-[0_10px_40px_rgba(79,41,22,.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(79,41,22,.14)]"><button onClick={() => openProduct(product)} className="block w-full text-left"><ProductImage src={product.imageUrl} alt={product.name} className="aspect-[1.08] w-full transition duration-500 group-hover:scale-[1.035]" /><div className="p-4 sm:p-5">{product.featured && <span className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[.12em] text-[#a16e48]"><Sparkles className="size-3" /> Destaque</span>}<h3 className="font-serif text-xl leading-tight sm:text-2xl">{product.name}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-[#7a6252]">{product.description}</p><div className="mt-4 flex items-center justify-between gap-2"><strong className="text-lg">{money(product.price)}</strong>{product.soldOut ? <span className="rounded-full bg-[#eee6dc] px-3 py-2 text-xs font-semibold text-[#8f7664]">Esgotado</span> : <span className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-[#6b351b] to-[#3f1b0c] text-white shadow-lg shadow-[#5b2c16]/25 transition group-hover:scale-110"><Plus className="size-5" /></span>}</div></div></button></article>)}
          </div>
          {!visibleProducts.length && <div className="mt-8 rounded-3xl border border-dashed border-[#6a3d24]/25 p-10 text-center text-[#806b5d]">Nenhum doce encontrado nessa categoria.</div>}
        </section>

        <section id="loja" className="bg-[#5b2c16] text-[#fff8ed]"><div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-20"><div><p className="text-sm font-semibold uppercase tracking-[.2em] text-[#e8bd80]">Retire com tranquilidade</p><h2 className="mt-3 font-serif text-4xl">Sua encomenda espera por você.</h2><p className="mt-5 max-w-lg leading-7 text-[#eadbce]">Não realizamos entregas. Escolha o melhor horário no checkout e retire seu pedido fresquinho na loja.</p></div><div className="grid gap-4"><div className="flex gap-4 rounded-2xl bg-white/8 p-4"><MapPin className="mt-1 shrink-0 text-[#e8bd80]" /><div><strong>Endereço</strong><p className="mt-1 text-[#eadbce]">{settings.address}</p></div></div><div className="flex gap-4 rounded-2xl bg-white/8 p-4"><Clock3 className="mt-1 shrink-0 text-[#e8bd80]" /><div><strong>Horário de retirada</strong><p className="mt-1 text-[#eadbce]">Das {settings.openTime} às {settings.closeTime}, conforme disponibilidade</p></div></div><div className="flex gap-4 rounded-2xl bg-white/8 p-4"><AtSign className="mt-1 shrink-0 text-[#e8bd80]" /><div><strong>Fale com a gente</strong><p className="mt-1 text-[#eadbce]">{settings.phone} · {settings.instagram}</p></div></div></div></div></section>
      </main>

      <footer className="bg-[#35170b] px-4 py-7 text-center text-sm text-[#d9c5b7]">© {new Date().getFullYear()} {settings.storeName} · Doceria & Confeitaria · Somente retirada na loja</footer>
      <a href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label="Falar com a Doce é Ser pelo WhatsApp" className="fixed bottom-5 left-5 z-30 flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-[#168744] to-[#22ad5d] px-4 font-semibold text-white shadow-[0_10px_28px_rgba(22,135,68,.35)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(22,135,68,.45)]"><MessageCircle className="size-6" /><span className="hidden sm:inline">WhatsApp</span></a>

      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className={`max-h-[94vh] overflow-y-auto rounded-3xl border-[#6a3d24]/15 bg-[#fffaf4] p-0 ${productIsCombo ? "sm:max-w-5xl" : "sm:max-w-2xl"}`}>
          {selectedProduct && <div className={productIsCombo ? "grid lg:grid-cols-[.9fr_1.1fr]" : ""}>
            <ProductImage src={selectedProduct.imageUrl} alt={selectedProduct.name} className={`${productIsCombo ? "min-h-72 h-full lg:min-h-[560px] lg:rounded-l-3xl" : "aspect-[16/8] rounded-t-3xl"} w-full`} />
            <div className="space-y-5 p-6">
              <DialogHeader><DialogTitle className="font-serif text-3xl">{selectedProduct.name}</DialogTitle><DialogDescription className="text-base leading-7 text-[#7a6252]">{selectedProduct.description}</DialogDescription></DialogHeader>
              <ProductOptionsPicker options={productOptions} selections={selectedOptions} onChange={setSelectedOptions} />
              <div><Label htmlFor="product-notes">Observações</Label><textarea id="product-notes" value={productNotes} onChange={(event) => setProductNotes(event.target.value)} placeholder="Ex.: sem granulado" className="mt-2 min-h-20 w-full rounded-2xl border border-[#6a3d24]/15 bg-white p-3 outline-none focus:ring-2 focus:ring-[#8b5d3d]/30" /></div>
              <Button onClick={addSelectedProduct} disabled={selectedProduct.soldOut} className={`h-13 w-full text-base ${primaryButton}`}>{selectedProduct.soldOut ? "Produto esgotado" : `Adicionar · ${money(selectedProduct.price)}`}</Button>
            </div>
          </div>}
        </DialogContent>
      </Dialog>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}><SheetContent className="w-full max-w-lg border-[#6a3d24]/15 bg-[#fffaf4] sm:max-w-lg"><SheetHeader><SheetTitle className="font-serif text-3xl">Seu carrinho</SheetTitle><SheetDescription>Seu pedido será retirado presencialmente.</SheetDescription></SheetHeader><div className="flex-1 overflow-y-auto px-4">{!cart.length ? <div className="grid h-full place-items-center py-12 text-center text-[#806b5d]"><div><ShoppingBag className="mx-auto mb-4 size-12 opacity-40" /><p>Seu carrinho ainda está vazio.</p></div></div> : <div className="space-y-3">{cart.map((item, index) => <div key={`${item.product.id}-${index}`} className="flex gap-3 rounded-2xl border border-[#6a3d24]/10 bg-white p-3"><ProductImage src={item.product.imageUrl} alt={item.product.name} className="size-20 shrink-0 rounded-xl" /><div className="min-w-0 flex-1"><h3 className="font-semibold">{item.product.name}</h3><p className="truncate text-xs text-[#806b5d]">{item.selectedOptions.join(" · ")}</p><div className="mt-2 flex items-center justify-between"><strong>{money(item.product.price * item.quantity)}</strong><div className="flex items-center gap-2"><button aria-label="Diminuir" onClick={() => updateQuantity(index, -1)} className="grid size-8 place-items-center rounded-full border border-[#6a3d24]/20 bg-[#fffaf4] transition hover:bg-[#f2e4d2]"><Minus className="size-4" /></button><span>{item.quantity}</span><button aria-label="Aumentar" onClick={() => updateQuantity(index, 1)} className="grid size-8 place-items-center rounded-full border border-[#6a3d24]/20 bg-[#fffaf4] transition hover:bg-[#f2e4d2]"><Plus className="size-4" /></button></div></div></div><button aria-label="Excluir" onClick={() => setCart((current) => current.filter((_, i) => i !== index))} className="self-start rounded-full p-2 text-[#9b7b68] transition hover:bg-[#f7e5e2] hover:text-[#9f291f]"><Trash2 className="size-4" /></button></div>)}</div>}</div>{cart.length > 0 && <div className="border-t border-[#6a3d24]/10 p-4"><div className="mb-4 rounded-2xl bg-[#f2e4d2] p-3 text-sm font-medium text-[#63351e]">Pedidos disponíveis somente para retirada na loja. Não realizamos entregas.</div><div className="mb-4 flex items-center justify-between text-lg"><span>Total</span><strong>{money(total)}</strong></div><Button onClick={() => { setCartOpen(false); setCheckout(true); }} className={`h-13 w-full text-base ${primaryButton}`}>Escolher retirada</Button></div>}</SheetContent></Sheet>

      <CheckoutDialog open={checkout} onOpenChange={setCheckout} cart={cart} settings={settings} total={total} onConfirmed={(order) => { setCart([]); setCheckout(false); setConfirmation(order); }} />
      <ConfirmationDialog order={confirmation} settings={settings} onClose={() => setConfirmation(null)} />
      <TrackingDialog open={tracking} onOpenChange={setTracking} order={trackedOrder} onOrder={setTrackedOrder} />
    </div>
  );
}

function ProductOptionsPicker({ options, selections, onChange }: { options: ProductOption[]; selections: string[][]; onChange: (options: string[][]) => void }) {
  function select(optionIndex: number, name: string, required: number) {
    const next = selections.map((values) => [...values]);
    const current = next[optionIndex] ?? [];
    if (current.includes(name)) next[optionIndex] = current.filter((value) => value !== name);
    else if (required === 1) next[optionIndex] = [name];
    else if (current.length < required) next[optionIndex] = [...current, name];
    else return toast.error(`Você pode escolher até ${required} opções neste grupo.`);
    onChange(next);
  }

  if (!options.length) return null;
  return <div className="space-y-5">{options.map((option, optionIndex) => {
    const required = optionSelectionCount(option);
    const current = selections[optionIndex] ?? [];
    const combo = isComboOption(option);
    return <fieldset key={`${option.name}-${optionIndex}`} className={combo ? "overflow-hidden rounded-2xl border border-[#6a3d24]/12 bg-white" : ""}>
      <div className={combo ? "flex items-start justify-between gap-3 bg-[#f3eadf] p-4" : "mb-2 flex items-center justify-between gap-3"}>
        <div><legend className="font-semibold">{option.name}</legend>{option.description && <p className="mt-1 text-sm text-[#806b5d]">{option.description}</p>}</div>
        <div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-[#5b2c16] px-2.5 py-1 text-xs font-bold text-white">{current.length}/{required}</span><span className="hidden rounded-full bg-[#ead8c3] px-2.5 py-1 text-[10px] font-bold uppercase text-[#6a3d24] sm:inline">Obrigatório</span></div>
      </div>
      {combo ? <div className="divide-y divide-[#6a3d24]/10">{option.values.map((value, index) => {
        const choice = choiceDetails(value, index);
        const selected = current.includes(choice.name);
        return <button type="button" key={choice.id} onClick={() => select(optionIndex, choice.name, required)} className={`grid w-full grid-cols-[76px_1fr_auto] items-center gap-4 p-4 text-left transition hover:bg-[#fff8ef] ${selected ? "bg-[#f8eee1]" : "bg-white"}`}>
          {choice.imageUrl ? <ProductImage src={choice.imageUrl} alt={choice.name} className="aspect-square w-full rounded-xl" /> : <span className="grid aspect-square place-items-center rounded-xl bg-[#f2e4d2] text-[#8b674e]"><Sparkles className="size-5" /></span>}
          <span><strong className="block leading-tight">{choice.name}</strong>{choice.description && <small className="mt-1 block leading-5 text-[#806b5d]">{choice.description}</small>}</span>
          <span className={`grid size-10 place-items-center rounded-full border transition ${selected ? "border-[#5b2c16] bg-[#5b2c16] text-white" : "border-[#b99b85]/40 bg-white text-[#6b351b]"}`}>{selected ? <Check className="size-5" /> : <Plus className="size-5" />}</span>
        </button>;
      })}</div> : <div className="flex flex-wrap gap-2">{option.values.map((value, index) => {
        const choice = choiceDetails(value, index);
        const selected = current.includes(choice.name);
        return <button type="button" key={choice.id} onClick={() => select(optionIndex, choice.name, required)} className={`rounded-full border px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 ${selected ? "border-[#5b2c16] bg-[#5b2c16] text-white shadow-md" : "border-[#6a3d24]/20 bg-white hover:border-[#8b674e]/45 hover:shadow-sm"}`}>{choice.name}</button>;
      })}</div>}
    </fieldset>;
  })}</div>;
}

function CheckoutDialog({ open, onOpenChange, cart, settings, total, onConfirmed }: { open: boolean; onOpenChange: (open: boolean) => void; cart: CartLine[]; settings: Catalog["settings"]; total: number; onConfirmed: (order: Order) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const slots = useMemo(() => {
    const result: string[] = [];
    const [openHour, openMinute] = settings.openTime.split(":").map(Number);
    const [closeHour, closeMinute] = settings.closeTime.split(":").map(Number);
    for (let minutes = openHour * 60 + openMinute; minutes < closeHour * 60 + closeMinute; minutes += settings.intervalMinutes) result.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
    return result;
  }, [settings]);
  const [openedAt] = useState(() => Date.now());
  const minDate = new Date(openedAt + settings.prepMinutes * 60_000).toISOString().slice(0, 10);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerName: form.get("name"), phone: form.get("phone"), pickupDate: form.get("date"), pickupTime: form.get("time"), notes: form.get("notes"), paymentMethod: form.get("payment"), items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity, selectedOptions: item.selectedOptions, notes: item.notes })) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      onConfirmed(data.order);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível finalizar."); } finally { setSubmitting(false); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[94vh] overflow-y-auto rounded-3xl bg-[#fffaf4] sm:max-w-2xl"><DialogHeader><DialogTitle className="font-serif text-3xl">Finalizar pedido</DialogTitle><DialogDescription>Escolha quando você virá retirar na {settings.storeName}.</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2 rounded-2xl bg-[#f2e4d2] p-3 text-sm font-semibold text-[#63351e]">Somente retirada na loja · não solicitamos endereço.</div><label className="grid gap-2"><span className="font-medium">Nome completo</span><Input name="name" required minLength={3} className="h-12 bg-white" /></label><label className="grid gap-2"><span className="font-medium">Telefone / WhatsApp</span><Input name="phone" required minLength={8} className="h-12 bg-white" /></label><label className="grid gap-2"><span className="font-medium">Data de retirada</span><Input type="date" name="date" min={minDate} required className="h-12 bg-white" /></label><label className="grid gap-2"><span className="font-medium">Horário</span><select name="time" required defaultValue="" className="h-12 rounded-md border bg-white px-3"><option value="" disabled>Selecione</option>{slots.map((slot) => <option key={slot}>{slot}</option>)}</select></label><label className="grid gap-2 sm:col-span-2"><span className="font-medium">Pagamento</span><select name="payment" className="h-12 rounded-md border bg-white px-3">{(JSON.parse(settings.paymentMethodsJson || "[]") as string[]).map((method) => <option key={method}>{method}</option>)}</select><small className="text-[#806b5d]">Pagamento realizado na retirada.</small></label><label className="grid gap-2 sm:col-span-2"><span className="font-medium">Observações</span><textarea name="notes" className="min-h-20 rounded-xl border bg-white p-3" placeholder="Algo que precisamos saber?" /></label><div className="sm:col-span-2 rounded-2xl border p-4"><div className="flex items-center justify-between"><span>{cart.reduce((sum, item) => sum + item.quantity, 0)} itens</span><strong className="text-lg">{money(total)}</strong></div></div><Button disabled={submitting} className={`h-13 text-base sm:col-span-2 ${primaryButton}`}>{submitting ? "Enviando pedido…" : "Confirmar pedido para retirada"}</Button></form></DialogContent></Dialog>;
}

function ConfirmationDialog({ order, settings, onClose }: { order: Order | null; settings: Catalog["settings"]; onClose: () => void }) {
  return <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}><DialogContent className="rounded-3xl bg-[#fffaf4] text-center sm:max-w-lg">{order && <><div className="mx-auto grid size-16 place-items-center rounded-full bg-[#dcebd8] text-[#2d6428]"><Check className="size-8" /></div><DialogHeader><DialogTitle className="text-center font-serif text-3xl">Pedido #{order.orderNumber}</DialogTitle><DialogDescription className="text-center text-base leading-7">Pedido recebido! Estamos preparando tudo com carinho. Retire seu pedido na Doce é Ser no horário escolhido.</DialogDescription></DialogHeader><div className="rounded-2xl bg-white p-4 text-left"><p><strong>Retirada:</strong> {new Date(`${order.pickupDate}T12:00:00`).toLocaleDateString("pt-BR")} às {order.pickupTime}</p><p className="mt-2"><strong>Pagamento:</strong> {order.paymentMethod} na retirada</p><p className="mt-2"><strong>Total:</strong> {money(order.total)}</p><p className="mt-2"><strong>Local:</strong> {settings.address}</p></div><a href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><Button className="w-full rounded-full bg-[#1f9d55] text-white">Falar com a Doce é Ser pelo WhatsApp</Button></a></>}</DialogContent></Dialog>;
}

function TrackingDialog({ open, onOpenChange, order, onOrder }: { open: boolean; onOpenChange: (open: boolean) => void; order: Order | null; onOrder: (order: Order | null) => void }) {
  async function track(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch(`/api/orders?number=${encodeURIComponent(String(form.get("number")))}&phone=${encodeURIComponent(String(form.get("phone")))}`); const data = await response.json(); if (!response.ok) return toast.error(data.error); onOrder(data.order); }
  const stages = ["received", "confirmed", "preparing", "ready", "picked_up"];
  return <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) onOrder(null); }}><DialogContent className="rounded-3xl bg-[#fffaf4] sm:max-w-lg"><DialogHeader><DialogTitle className="font-serif text-3xl">Meus pedidos</DialogTitle><DialogDescription>Acompanhe usando o telefone e o número do pedido.</DialogDescription></DialogHeader>{!order ? <form onSubmit={track} className="space-y-4"><label className="grid gap-2"><span>Número do pedido</span><Input name="number" placeholder="Ex.: 1024" required /></label><label className="grid gap-2"><span>Telefone / WhatsApp</span><Input name="phone" required /></label><Button className={`h-12 w-full ${primaryButton}`}>Consultar pedido</Button></form> : <div><div className="rounded-2xl bg-white p-4"><p className="text-sm text-[#806b5d]">Pedido #{order.orderNumber}</p><p className="mt-1 font-serif text-2xl">{statusLabels[order.status]}</p><p className="mt-2 text-sm">Retirada em {new Date(`${order.pickupDate}T12:00:00`).toLocaleDateString("pt-BR")} às {order.pickupTime}</p></div>{order.status !== "cancelled" && <div className="mt-5 flex justify-between">{stages.map((stage, index) => { const active = index <= stages.indexOf(order.status); return <div key={stage} className="flex flex-1 flex-col items-center"><span className={`grid size-8 place-items-center rounded-full ${active ? "bg-[#5b2c16] text-white" : "bg-[#e9ddd2] text-[#9c8779]"}`}>{active ? <Check className="size-4" /> : index + 1}</span>{index < stages.length - 1 && <span />}</div>; })}</div>}<Button variant="outline" onClick={() => onOrder(null)} className={`mt-6 w-full ${secondaryButton}`}>Consultar outro pedido</Button></div>}</DialogContent></Dialog>;
}
