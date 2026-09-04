"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BellRing, CheckCircle2, ChevronRight, ClipboardList, Clock3, Download, LayoutDashboard, LogOut, Menu, PackageOpen, Pencil, Plus, Settings, ShoppingBag, Store, Trash2, Upload, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import ProductImage from "@/components/product-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import type { Catalog, Category, Order, Product, Settings as StoreSettings } from "@/lib/types";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

type AdminData = Catalog & { orders: Order[]; user: { displayName: string; email: string } };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const statusLabels: Record<string, string> = { received: "Recebido", confirmed: "Confirmado", preparing: "Em preparação", ready: "Pronto", picked_up: "Retirado", cancelled: "Cancelado" };
const nextStatus: Record<string, string> = { received: "confirmed", confirmed: "preparing", preparing: "ready", ready: "picked_up" };
const nextLabels: Record<string, string> = { received: "Confirmar", confirmed: "Iniciar preparo", preparing: "Marcar como pronto", ready: "Marcar retirado" };
const adminPrimaryButton = "rounded-full bg-gradient-to-r from-[#4a2110] via-[#6b351b] to-[#4a2110] font-semibold text-white shadow-[0_9px_24px_rgba(74,33,16,.22)] transition-all hover:-translate-y-0.5 hover:shadow-[0_13px_30px_rgba(74,33,16,.3)] active:translate-y-0";
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function AdminDashboard() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(Boolean(supabase));
  const [data, setData] = useState<AdminData | null>(null);
  const [tab, setTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [productEditor, setProductEditor] = useState<Product | Partial<Product> | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<Category | Partial<Category> | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [volume, setVolume] = useState(.55);
  const [alertOrder, setAlertOrder] = useState<Order | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)));
  const knownOrderRef = useRef<number | null>(null);
  const alarmRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setCheckingSession(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => { setInstallPrompt(null); setIsInstalled(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const beep = useCallback(() => {
    if (!soundOn) return;
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const context = new AudioCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(volume * .18, context.currentTime);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .22);
    oscillator.onended = () => context.close();
  }, [soundOn, volume]);

  const load = useCallback(async (poll = false) => {
    if (!session?.access_token) return;
    try {
      const response = await fetch("/api/admin", { cache: "no-store", headers: { authorization: `Bearer ${session.access_token}` } });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error);
      const newest = next.orders?.[0] as Order | undefined;
      if (poll && newest && knownOrderRef.current && newest.id > knownOrderRef.current && newest.status === "received") setAlertOrder(newest);
      if (newest) knownOrderRef.current = Math.max(knownOrderRef.current ?? 0, newest.id);
      setData(next);
    } catch (error) { if (!poll) toast.error(error instanceof Error ? error.message : "Não foi possível carregar o painel."); }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void Promise.resolve().then(() => load());
    const timer = setInterval(() => load(true), 15000);
    const channel = supabase?.channel("admin-orders").on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => load(true)).subscribe();
    return () => { clearInterval(timer); if (channel) supabase?.removeChannel(channel); };
  }, [load, session, supabase]);
  useEffect(() => {
    if (alertOrder && soundOn) { beep(); alarmRef.current = setInterval(beep, 2500); }
    return () => { if (alarmRef.current) clearInterval(alarmRef.current); alarmRef.current = null; };
  }, [alertOrder, soundOn, beep]);

  async function action(payload: Record<string, unknown>, success: string) {
    const response = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    toast.success(success); await load();
  }

  async function updateOrderStatus(order: Order, status: string) {
    try { await action({ action: "updateOrderStatus", id: order.id, status }, `Pedido #${order.orderNumber} atualizado.`); setAlertOrder((current) => current?.id === order.id ? null : current); } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao atualizar."); }
  }

  async function installPanel() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") toast.success("Painel instalado neste aparelho.");
      setInstallPrompt(null);
      return;
    }
    toast.info("No celular, abra o menu do navegador e escolha “Adicionar à tela inicial” ou “Instalar app”.", { duration: 7000 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = data?.orders.filter((order) => order.createdAt.slice(0, 10) === today) ?? [];
  const revenue = todayOrders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.total, 0);
  const nav = [{ value: "dashboard", label: "Visão geral", icon: LayoutDashboard }, { value: "orders", label: "Pedidos", icon: ClipboardList }, { value: "menu", label: "Cardápio", icon: ShoppingBag }, { value: "categories", label: "Categorias", icon: PackageOpen }, { value: "settings", label: "Loja", icon: Settings }];

  if (!supabase) return <SetupNotice />;
  if (checkingSession) return <LoadingPanel label="Verificando acesso…" />;
  if (!session) return <AdminLogin onLogin={async (email, password) => { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; }} />;
  if (!data) return <LoadingPanel label="Abrindo o painel…" />;

  return <div className="min-h-screen bg-[#f7f3ed] text-[#35251d]"><Toaster richColors position="top-center" />
    {alertOrder && <div className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-2xl items-center gap-4 rounded-2xl bg-[#9f291f] p-4 text-white shadow-2xl"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15"><BellRing className="animate-pulse" /></span><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[.18em]">Novo pedido recebido</p><p className="truncate font-serif text-xl">#{alertOrder.orderNumber} · {alertOrder.customerName}</p></div><Button onClick={() => { setTab("orders"); setAlertOrder(null); }} className="bg-white text-[#8d251c] hover:bg-white/90">Visualizar</Button><button onClick={() => setAlertOrder(null)} aria-label="Fechar"><X /></button></div>}
    <aside className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-[#53311d]/10 bg-[#4b2514] p-5 text-[#fff8ef] transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}><div className="flex items-center gap-3"><Image src="/assets/logo-doce-e-ser.png" alt="Doce é Ser" width={54} height={54} className="rounded-2xl" /><div><p className="font-serif text-xl">Doce é Ser</p><p className="text-xs text-[#d8bdac]">Painel administrativo</p></div></div><nav className="mt-10 grid gap-2">{nav.map((item) => <button key={item.value} onClick={() => { setTab(item.value); setMenuOpen(false); }} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all ${tab === item.value ? "bg-[#f2d29f] text-[#4b2514] shadow-lg shadow-black/10" : "text-[#ead8ca] hover:translate-x-1 hover:bg-white/8"}`}><item.icon className="size-5" />{item.label}</button>)}</nav><div className="absolute inset-x-5 bottom-5 space-y-2">{!isInstalled && <button onClick={installPanel} className="flex w-full items-center gap-3 rounded-xl bg-[#f2d29f] px-4 py-3 text-left text-sm font-semibold text-[#4b2514] shadow-lg transition hover:-translate-y-0.5 hover:bg-[#f7ddb2]"><Download className="size-5" />Instalar painel</button>}<Link href="/" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-[#ead8ca] transition hover:bg-white/8"><Store className="size-5" />Ver loja</Link><button onClick={() => supabase.auth.signOut()} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-[#ead8ca] transition hover:bg-white/8"><LogOut className="size-5" />Sair</button></div></aside>
    {menuOpen && <button aria-label="Fechar menu" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-40 bg-black/30 lg:hidden" />}
    <main className="lg:pl-72"><header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-[#53311d]/10 bg-[#f7f3ed]/95 px-4 backdrop-blur sm:px-7"><button onClick={() => setMenuOpen(true)} className="rounded-full p-2 transition hover:bg-white lg:hidden"><Menu /></button><div><p className="font-serif text-2xl">{nav.find((item) => item.value === tab)?.label}</p><p className="text-xs text-[#846d5e]">Olá, {data.user.displayName.split(" ")[0]}</p></div><div className="ml-auto flex items-center gap-3"><Button variant="outline" onClick={() => { const next = !soundOn; setSoundOn(next); if (next) setTimeout(beep, 0); }} className="rounded-full bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">{soundOn ? <Volume2 /> : <VolumeX />}<span className="hidden sm:inline">{soundOn ? "Som ativo" : "Ativar som"}</span></Button></div></header>
      <div className="p-4 sm:p-7 lg:p-9">
        {tab === "dashboard" && <section><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Pedidos novos" value={String(data.orders.filter((order) => order.status === "received").length)} icon={BellRing} tone="red" /><Metric label="Em preparação" value={String(data.orders.filter((order) => order.status === "preparing").length)} icon={Clock3} /><Metric label="Prontos" value={String(data.orders.filter((order) => order.status === "ready").length)} icon={CheckCircle2} tone="green" /><Metric label="Vendas de hoje" value={money(revenue)} icon={ShoppingBag} /></div><div className="mt-7 grid gap-6 xl:grid-cols-[1.25fr_.75fr]"><Panel title="Pedidos recentes" action={<button onClick={() => setTab("orders")} className="text-sm font-semibold text-[#7b4a2f]">Ver todos</button>}><OrderList orders={data.orders.slice(0, 5)} onStatus={updateOrderStatus} /></Panel><Panel title="Alarme de pedidos"><div className="space-y-5"><div className="flex items-center justify-between"><div><p className="font-semibold">Som do painel</p><p className="text-sm text-[#806b5d]">Repete até visualizar o pedido.</p></div><Switch checked={soundOn} onCheckedChange={(checked) => { setSoundOn(checked); if (checked) setTimeout(beep, 0); }} /></div><label className="block"><span className="text-sm font-medium">Volume</span><input type="range" min="0" max="1" step=".05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="mt-2 w-full accent-[#5b2c16]" /></label><Button variant="outline" onClick={beep} disabled={!soundOn} className="w-full">Testar alarme</Button><p className="rounded-xl bg-[#efe5d9] p-3 text-xs leading-5 text-[#725844]">Mantenha o painel aberto para receber atualização automática, aviso visual e som.</p></div></Panel></div></section>}
        {tab === "orders" && <Panel title="Todos os pedidos" action={<span className="text-sm text-[#806b5d]">Atualização automática</span>}><OrderList orders={data.orders} onStatus={updateOrderStatus} detailed /></Panel>}
        {tab === "menu" && <Panel title="Produtos" action={<Button onClick={() => setProductEditor({ categoryId: data.categories[0]?.id, active: true, soldOut: false, featured: false, imageUrl: "sprite:0", price: 0, optionsJson: "[]", sortOrder: data.products.length })} className={adminPrimaryButton}><Plus />Novo produto</Button>}><div className="grid gap-3">{data.products.map((product) => <div key={product.id} className="flex items-center gap-3 rounded-2xl border border-[#53311d]/10 bg-white p-3 transition hover:border-[#8b674e]/25 hover:shadow-md"><ProductImage src={product.imageUrl} alt={product.name} className="size-20 shrink-0 rounded-xl" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{product.name}</h3>{product.soldOut && <span className="rounded-full bg-[#f4dfdc] px-2 py-1 text-xs text-[#8d251c]">Esgotado</span>}{!product.active && <span className="rounded-full bg-[#eae5df] px-2 py-1 text-xs">Inativo</span>}</div><p className="truncate text-sm text-[#806b5d]">{data.categories.find((item) => item.id === product.categoryId)?.name} · {money(product.price)}</p></div><Button variant="outline" size="icon" title="Editar produto" className="rounded-full bg-white transition hover:bg-[#f2e4d2]" onClick={() => setProductEditor(product)}><Pencil /></Button><Button variant="outline" size="icon" title="Excluir produto" className="rounded-full bg-white text-[#9f291f] transition hover:bg-[#f8e2df] hover:text-[#851e17]" onClick={() => confirm("Excluir este produto?") && action({ action: "deleteProduct", id: product.id }, "Produto excluído.").catch((error) => toast.error(error.message))}><Trash2 /></Button></div>)}</div></Panel>}
        {tab === "categories" && <Panel title="Categorias" action={<Button onClick={() => setCategoryEditor({ active: true, sortOrder: data.categories.length })} className={adminPrimaryButton}><Plus />Nova categoria</Button>}><div className="grid gap-3">{data.categories.map((category) => <div key={category.id} className="flex items-center gap-3 rounded-2xl border bg-white p-4 transition hover:border-[#8b674e]/25 hover:shadow-md"><span className="grid size-9 place-items-center rounded-full bg-[#efe5d9] text-sm font-bold">{category.sortOrder + 1}</span><div className="flex-1"><p className="font-semibold">{category.name}</p><p className="text-xs text-[#806b5d]">{category.active ? "Visível no cardápio" : "Oculta"}</p></div><Button variant="outline" size="icon" title="Editar categoria" className="rounded-full bg-white transition hover:bg-[#f2e4d2]" onClick={() => setCategoryEditor(category)}><Pencil /></Button><Button variant="outline" size="icon" title="Excluir categoria" className="rounded-full bg-white text-[#9f291f] transition hover:bg-[#f8e2df] hover:text-[#851e17]" onClick={() => confirm("Excluir esta categoria?") && action({ action: "deleteCategory", id: category.id }, "Categoria excluída.").catch((error) => toast.error(error.message))}><Trash2 /></Button></div>)}</div></Panel>}
        {tab === "settings" && <SettingsForm settings={data.settings} onSave={(settings) => action({ action: "saveSettings", settings }, "Configurações salvas.")} />}
      </div>
    </main>
    {productEditor && <ProductEditor key={productEditor.id ?? "new"} token={session.access_token} product={productEditor} categories={data.categories} onClose={() => setProductEditor(null)} onSave={async (product) => { await action({ action: "saveProduct", product }, "Produto salvo."); setProductEditor(null); }} />}
    {categoryEditor && <CategoryEditor key={categoryEditor.id ?? "new"} category={categoryEditor} onClose={() => setCategoryEditor(null)} onSave={async (category) => { await action({ action: "saveCategory", category }, "Categoria salva."); setCategoryEditor(null); }} />}
  </div>;
}

function AdminLogin({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setLoading(true); try { await onLogin(String(form.get("email")), String(form.get("password"))); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível entrar."); } finally { setLoading(false); } }
  return <main className="grid min-h-screen place-items-center bg-[#f7f3ed] p-5"><Toaster richColors /><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-[#53311d]/10 bg-white p-7 shadow-xl"><Image src="/assets/logo-doce-e-ser.png" alt="Doce é Ser" width={88} height={88} className="mx-auto rounded-3xl" /><h1 className="mt-5 text-center font-serif text-3xl">Painel administrativo</h1><p className="mt-2 text-center text-sm text-[#806b5d]">Acesso exclusivo da proprietária.</p><div className="mt-7 space-y-4"><Field label="E-mail"><Input type="email" name="email" required autoComplete="email" /></Field><Field label="Senha"><Input type="password" name="password" required autoComplete="current-password" /></Field><Button disabled={loading} className={`h-12 w-full ${adminPrimaryButton}`}>{loading ? "Entrando…" : "Entrar"}</Button></div></form></main>;
}
function LoadingPanel({ label }: { label: string }) { return <main className="grid min-h-screen place-items-center bg-[#f7f3ed]"><div className="text-center"><Image src="/assets/logo-doce-e-ser.png" alt="Doce é Ser" width={96} height={96} className="mx-auto rounded-3xl" /><p className="mt-4 text-[#7a6252]">{label}</p></div></main>; }
function SetupNotice() { return <main className="grid min-h-screen place-items-center bg-[#f7f3ed] p-6"><div className="max-w-lg rounded-3xl bg-white p-7 text-center shadow-xl"><h1 className="font-serif text-3xl">Conecte o Supabase</h1><p className="mt-3 leading-7 text-[#806b5d]">Copie o arquivo <strong>.env.example</strong> para <strong>.env.local</strong> e preencha as chaves do seu projeto. O guia completo está no README.</p></div></main>; }
function Metric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof BellRing; tone?: string }) { return <div className="rounded-2xl border border-[#53311d]/10 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm text-[#806b5d]">{label}</p><p className="mt-2 font-serif text-3xl">{value}</p></div><span className={`grid size-10 place-items-center rounded-xl ${tone === "red" ? "bg-[#f5dfdc] text-[#9f291f]" : tone === "green" ? "bg-[#e0ebdd] text-[#32652e]" : "bg-[#efe5d9] text-[#6a3d24]"}`}><Icon className="size-5" /></span></div></div>; }
function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-3xl border border-[#53311d]/10 bg-[#fffdf9] p-4 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between gap-4"><h2 className="font-serif text-2xl">{title}</h2>{action}</div>{children}</section>; }

function OrderList({ orders, onStatus, detailed = false }: { orders: Order[]; onStatus: (order: Order, status: string) => void; detailed?: boolean }) { if (!orders.length) return <div className="rounded-2xl border border-dashed p-8 text-center text-[#806b5d]">Nenhum pedido por aqui ainda.</div>; return <div className="space-y-3">{orders.map((order) => <article key={order.id} className="rounded-2xl border border-[#53311d]/10 bg-white p-4 transition hover:border-[#8b674e]/25 hover:shadow-md"><div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-serif text-xl">#{order.orderNumber}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${order.status === "received" ? "bg-[#f5dfdc] text-[#9f291f]" : order.status === "ready" ? "bg-[#e0ebdd] text-[#32652e]" : "bg-[#efe5d9] text-[#76513c]"}`}>{statusLabels[order.status]}</span></div><p className="mt-1 text-sm"><strong>{order.customerName}</strong> · {order.phone}</p><p className="mt-1 text-sm text-[#806b5d]">Retirada {new Date(`${order.pickupDate}T12:00:00`).toLocaleDateString("pt-BR")} às {order.pickupTime} · {money(order.total)} · {order.paymentMethod}</p>{detailed && <div className="mt-3 rounded-xl bg-[#f7f3ed] p-3 text-sm">{order.items.map((item) => <p key={item.id}>{item.quantity}× {item.productName}{item.optionsJson && item.optionsJson !== "[]" ? ` · ${JSON.parse(item.optionsJson).join(", ")}` : ""}</p>)}{order.notes && <p className="mt-2 text-[#8a4d2c]">Obs.: {order.notes}</p>}</div>}</div>{nextStatus[order.status] && <Button onClick={() => onStatus(order, nextStatus[order.status])} className={`w-full sm:w-auto ${adminPrimaryButton}`}>{nextLabels[order.status]} <ChevronRight /></Button>}</div></article>)}</div>; }

function ProductEditor({ token, product, categories, onClose, onSave }: { token: string; product: Partial<Product>; categories: Category[]; onClose: () => void; onSave: (product: Partial<Product>) => Promise<void> }) {
  const [draft, setDraft] = useState<Partial<Product>>(product); const [saving, setSaving] = useState(false);
  const open = true;
  async function upload(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; setSaving(true); try { const form = new FormData(); form.append("file", file); const response = await fetch("/api/admin/upload", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setDraft((current) => ({ ...current, imageUrl: data.url })); toast.success("Foto adicionada."); } catch (error) { toast.error(error instanceof Error ? error.message : "Erro no envio."); } finally { setSaving(false); } }
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await onSave(draft); } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao salvar."); } finally { setSaving(false); } }
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent className="max-h-[94vh] overflow-y-auto rounded-3xl bg-[#fffaf4] sm:max-w-2xl"><DialogHeader><DialogTitle className="font-serif text-3xl">{draft.id ? "Editar produto" : "Novo produto"}</DialogTitle><DialogDescription>Foto, preço, disponibilidade e opções do item.</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><div className="flex items-center gap-4">{draft.imageUrl && <ProductImage src={draft.imageUrl} alt="Prévia" className="size-28 rounded-2xl" />}<label className="flex h-12 cursor-pointer items-center gap-2 rounded-full border bg-white px-5 font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><Upload className="size-4" />Adicionar foto<input type="file" accept="image/*" className="hidden" onChange={upload} /></label></div></div><Field label="Nome"><Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></Field><Field label="Preço"><Input type="number" step="0.01" min="0.01" value={draft.price ?? ""} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} required /></Field><Field label="Categoria"><select value={draft.categoryId ?? ""} onChange={(e) => setDraft({ ...draft, categoryId: Number(e.target.value) })} className="h-10 rounded-md border bg-white px-3">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field label="Ordem"><Input type="number" value={draft.sortOrder ?? 0} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></Field><label className="grid gap-2 sm:col-span-2"><span className="font-medium">Descrição</span><textarea value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="min-h-20 rounded-xl border bg-white p-3" /></label><label className="grid gap-2 sm:col-span-2"><span className="font-medium">Opções (JSON)</span><textarea value={draft.optionsJson ?? "[]"} onChange={(e) => setDraft({ ...draft, optionsJson: e.target.value })} className="min-h-20 rounded-xl border bg-white p-3 font-mono text-sm" placeholder='[{"name":"Tamanho","values":["P","M","G"]}]' /><small className="text-[#806b5d]">Permite tamanhos, sabores e adicionais.</small></label><Toggle label="Produto ativo" checked={!!draft.active} onChange={(active) => setDraft({ ...draft, active })} /><Toggle label="Marcar como esgotado" checked={!!draft.soldOut} onChange={(soldOut) => setDraft({ ...draft, soldOut })} /><Toggle label="Mostrar em destaque" checked={!!draft.featured} onChange={(featured) => setDraft({ ...draft, featured })} /><Button disabled={saving} className={`h-12 sm:col-span-2 ${adminPrimaryButton}`}>{saving ? "Salvando…" : "Salvar produto"}</Button></form></DialogContent></Dialog>;
}

function CategoryEditor({ category, onClose, onSave }: { category: Partial<Category>; onClose: () => void; onSave: (category: Partial<Category>) => Promise<void> }) { const [draft, setDraft] = useState<Partial<Category>>(category); return <Dialog open onOpenChange={(value) => !value && onClose()}><DialogContent className="rounded-3xl bg-[#fffaf4]"><DialogHeader><DialogTitle className="font-serif text-3xl">Categoria</DialogTitle></DialogHeader><form onSubmit={(event) => { event.preventDefault(); onSave(draft).catch((error) => toast.error(error.message)); }} className="space-y-4"><Field label="Nome"><Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></Field><Field label="Ordem"><Input type="number" value={draft.sortOrder ?? 0} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></Field><Toggle label="Categoria ativa" checked={!!draft.active} onChange={(active) => setDraft({ ...draft, active })} /><Button className={`h-12 w-full ${adminPrimaryButton}`}>Salvar categoria</Button></form></DialogContent></Dialog>; }

function SettingsForm({ settings, onSave }: { settings: StoreSettings; onSave: (settings: StoreSettings) => Promise<void> }) { const [draft, setDraft] = useState(settings); async function submit(event: FormEvent) { event.preventDefault(); try { await onSave(draft); } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao salvar."); } } return <Panel title="Configurações da loja"><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><Field label="Nome da loja"><Input value={draft.storeName} onChange={(e) => setDraft({ ...draft, storeName: e.target.value })} /></Field><Field label="Telefone"><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field><Field label="WhatsApp"><Input value={draft.whatsapp} onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })} /></Field><Field label="Instagram"><Input value={draft.instagram} onChange={(e) => setDraft({ ...draft, instagram: e.target.value })} /></Field><label className="grid gap-2 sm:col-span-2"><span className="font-medium">Endereço para retirada</span><Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label><Field label="Link do Google Maps"><Input value={draft.mapsUrl} onChange={(e) => setDraft({ ...draft, mapsUrl: e.target.value })} /></Field><Field label="Abertura"><Input type="time" value={draft.openTime} onChange={(e) => setDraft({ ...draft, openTime: e.target.value })} /></Field><Field label="Fechamento"><Input type="time" value={draft.closeTime} onChange={(e) => setDraft({ ...draft, closeTime: e.target.value })} /></Field><Field label="Intervalo entre retiradas (min)"><Input type="number" min="10" value={draft.intervalMinutes} onChange={(e) => setDraft({ ...draft, intervalMinutes: Number(e.target.value) })} /></Field><Field label="Limite por horário"><Input type="number" min="1" value={draft.ordersPerSlot} onChange={(e) => setDraft({ ...draft, ordersPerSlot: Number(e.target.value) })} /></Field><Field label="Preparo mínimo (min)"><Input type="number" min="0" value={draft.prepMinutes} onChange={(e) => setDraft({ ...draft, prepMinutes: Number(e.target.value) })} /></Field><Field label="Dias fechados (0=dom, 6=sáb)"><Input value={draft.closedDaysJson} onChange={(e) => setDraft({ ...draft, closedDaysJson: e.target.value })} /></Field><label className="grid gap-2 sm:col-span-2"><span className="font-medium">Formas de pagamento</span><Input value={draft.paymentMethodsJson} onChange={(e) => setDraft({ ...draft, paymentMethodsJson: e.target.value })} /></label><Button className={`h-12 sm:col-span-2 ${adminPrimaryButton}`}>Salvar configurações</Button></form></Panel>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2"><span className="font-medium">{label}</span>{children}</label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3"><span className="text-sm font-medium">{label}</span><Switch checked={checked} onCheckedChange={onChange} /></label>; }
