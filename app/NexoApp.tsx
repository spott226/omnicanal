"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CHANNEL_DATA, DAILY_CHANNELS, DEMO_AUTOMATIONS, DEMO_METRICS, FUNNEL, hotLeadToAppointmentRate, newLeadToAppointmentRate } from "./demo-data";
import { api, type ApiConversation, type ApiDashboard, type ApiMessage, type BillingInterval, type BillingPlan, type BillingUsage, type KnowledgeKind, type KnowledgeRecord, type PlanPrice, type SubscriptionInfo } from "./api-client";

type Channel = "instagram" | "whatsapp" | "facebook";
type Temperature = "Frío" | "Tibio" | "Caliente";
type View = "Inicio" | "Conversaciones" | "Contactos" | "Entrenar IA" | "Base de conocimiento" | "Productos y servicios" | "Conexiones" | "Equipo" | "Plan y facturación" | "Configuración" | "Superadmin";
type ChatMessage = { body: string; from: "contact" | "ai" | "human"; time: string };
type Conversation = { id: string | number; organizationId: string; name: string; initials: string; channel: Channel; temperature: Temperature; last: string; time: string; unread: number; ai: boolean; transferred: boolean; closed: boolean; hasAppointment: boolean; score: number; interest: string; stage: string; color: string; summary: string; tags: string[]; note: string; reminder: string; messages: ChatMessage[] };
type AutomationRule = { name: string; channel: Channel; trigger: string; action: string; runs: number; active: boolean };
type DashboardMetrics = Partial<ApiDashboard>;
const settingsTabs = ["Organización","Equipo y roles","Notificaciones","Horarios","Seguridad","Facturación"] as const;
type SettingsTab = (typeof settingsTabs)[number];
type KnowledgeConfig = {
  label: string;
  titleKey: string;
  subtitleKey: string;
  create: () => Record<string, unknown>;
};

const CHANNELS: Record<Channel, { label: string; short: string }> = CHANNEL_DATA;

const names = ["Mariana López", "Carlos Mendoza", "Sofía Ramírez", "Diego Torres", "Ana Paula Ruiz", "Jorge Salas", "Renata Flores", "Luis Herrera", "Valeria Cruz", "Miguel Ángel", "Camila Ortiz", "Raúl Navarro", "Fernanda Gil", "Hugo Paredes", "Natalia Soto", "Iván Reyes", "Daniela Mora", "Emilio Vega", "Paola Luna", "Óscar Ríos", "Lucía Campos", "Adrián Silva", "Mónica Lara", "Marco Núñez", "Andrea León"];
const conversationScripts: { summary: string; messages: ChatMessage[] }[] = [
  { summary: "Quiere centralizar la atención de su equipo y aceptó una videollamada de demostración.", messages: [
    { body: "Hola, vi su publicación y quiero información.", from: "contact", time: "10:12" },
    { body: "¡Hola! Soy Nia, asistente virtual de Áurea Labs. Con gusto te ayudo. ¿Qué te gustaría mejorar en tu proceso de atención?", from: "ai", time: "10:15" },
    { body: "Quiero responder más rápido y no perder clientes.", from: "contact", time: "10:18" },
    { body: "Tiene sentido. Podemos centralizar tus canales y responder al instante. ¿Cuántas conversaciones reciben aproximadamente al mes?", from: "ai", time: "10:21" },
    { body: "Unas 800 entre Instagram y WhatsApp.", from: "contact", time: "10:24" },
    { body: "Con ese volumen, una demostración te ayudaría a ver el flujo completo. ¿Te gustaría agendar una videollamada de 20 minutos?", from: "ai", time: "10:26" },
    { body: "Sí me interesa una videollamada.", from: "contact", time: "10:28" },
  ]},
  { summary: "Está evaluando el plan profesional y solicitó conocer el precio de la asesoría.", messages: [
    { body: "Hola, somos un equipo de ventas de cinco personas.", from: "contact", time: "10:31" },
    { body: "¡Hola! Podemos ayudarles a ordenar sus conversaciones. ¿Qué canal concentra más consultas?", from: "ai", time: "10:34" },
    { body: "Principalmente WhatsApp. ¿Cuánto cuesta la asesoría?", from: "contact", time: "10:41" },
  ]},
  { summary: "Contacto nuevo que llegó desde una publicación; todavía no se ha calificado su necesidad.", messages: [
    { body: "Hola, vi su publicación y quiero información.", from: "contact", time: "11:42" },
  ]},
  { summary: "Conoce la propuesta, pero aún está evaluando si es el momento adecuado para avanzar.", messages: [
    { body: "¿La plataforma también reúne comentarios de Facebook?", from: "contact", time: "16:02" },
    { body: "Sí, reúne Messenger y comentarios en la misma bandeja. ¿Actualmente quién responde esos mensajes?", from: "ai", time: "16:05" },
    { body: "Los repartimos entre dos personas. Todavía no estoy seguro.", from: "contact", time: "16:11" },
  ]},
  { summary: "Busca entender el proceso de implementación antes de presentar la solución a su equipo.", messages: [
    { body: "Me interesa automatizar las preguntas repetidas.", from: "contact", time: "12:04" },
    { body: "Podemos configurar respuestas breves y transferir los casos importantes. ¿Cómo atienden hoy esas preguntas?", from: "ai", time: "12:08" },
    { body: "Las respondemos manualmente. ¿Cómo funciona la asesoría?", from: "contact", time: "12:13" },
  ]},
  { summary: "Mostró interés inicial y pidió retomar la conversación la próxima semana.", messages: [
    { body: "Quiero verlo con mi socio antes de decidir.", from: "contact", time: "09:17" },
    { body: "Claro, puedo dejar programado un seguimiento sin compromiso. ¿Qué día te funciona mejor?", from: "ai", time: "09:20" },
    { body: "Escríbeme la próxima semana.", from: "contact", time: "09:24" },
  ]},
  { summary: "Tiene intención alta y está buscando un horario disponible para una demostración.", messages: [
    { body: "Ya revisé los planes y me interesa el profesional.", from: "contact", time: "14:06" },
    { body: "Excelente. Podemos revisar el flujo de tu empresa en una llamada breve. ¿Qué día te gustaría?", from: "ai", time: "14:09" },
    { body: "¿Tienen disponibilidad este jueves?", from: "contact", time: "14:12" },
  ]},
  { summary: "Solicita comparar planes para elegir una opción adecuada al tamaño de su empresa.", messages: [
    { body: "Tenemos Instagram, Facebook y WhatsApp por separado.", from: "contact", time: "17:22" },
    { body: "next.io puede reunir los tres canales. ¿Cuántas personas atienden actualmente?", from: "ai", time: "17:25" },
    { body: "Somos ocho. Quisiera conocer los planes para mi empresa.", from: "contact", time: "17:29" },
  ]},
];
const colors = ["#f4b8a4", "#a9c8ff", "#b8ddc9", "#e9c5ff", "#ffd5a1", "#b8d8ee"];
const channelFromApi = (channel: string): Channel => channel === "WHATSAPP" ? "whatsapp" : channel === "FACEBOOK" ? "facebook" : "instagram";
const temperatureFromApi = (temperature: string): Temperature => temperature === "HOT" ? "Caliente" : temperature === "WARM" ? "Tibio" : "Frío";
const messageFromApi = (message: ApiMessage): ChatMessage => ({ body: message.content, from: message.senderType === "CONTACT" ? "contact" : message.senderType === "AI" ? "ai" : "human", time: formatTime(message.createdAt) });
const formatTime = (value?: string | null) => value ? new Date(value).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "Ahora";
const fullName = (contact: ApiConversation["contact"]) => `${contact.firstName} ${contact.lastName ?? ""}`.trim();
const initials = (name: string) => name.split(" ").slice(0, 2).map(part => part[0]).join("").toUpperCase();
const conversationFromApi = (item: ApiConversation, index: number): Conversation => {
  const name = fullName(item.contact);
  const messages = item.messages?.map(messageFromApi) ?? [];
  const latest = messages.at(-1);
  return {
    id: item.id,
    organizationId: item.organizationId,
    name,
    initials: initials(name),
    channel: channelFromApi(item.channel),
    temperature: temperatureFromApi(item.contact.leadTemperature),
    last: latest?.body ?? "Sin mensajes todavía",
    time: formatTime(item.lastMessageAt ?? item.contact.lastInteractionAt),
    unread: 0,
    ai: item.aiStatus === "ACTIVE",
    transferred: item.aiStatus === "TRANSFERRED",
    closed: item.status === "CLOSED",
    hasAppointment: Boolean(item.appointments?.length),
    score: item.contact.leadScore,
    interest: item.contact.leadScore >= 75 ? "Demo del producto" : item.contact.leadScore >= 50 ? "Plan profesional" : "InformaciÃ³n general",
    stage: item.contact.leadScore >= 75 ? "Oportunidad" : item.contact.leadScore >= 50 ? "Calificado" : "Nuevo",
    color: colors[index % colors.length],
    summary: item.summary ?? "ConversaciÃ³n sincronizada desde la base de datos.",
    tags: item.contact.tags?.map(tag => tag.tag.name) ?? ["Prospecto"],
    note: "",
    reminder: "",
    messages,
  };
};
const initialConversations: Conversation[] = names.map((name, i) => {
  const script = conversationScripts[i % conversationScripts.length];
  return {
    id: i + 1, organizationId:"org_aurea_labs_demo", name, initials: name.split(" ").slice(0, 2).map(n => n[0]).join(""), channel: (["instagram", "whatsapp", "facebook"] as Channel[])[i % 3],
    temperature: (["Caliente", "Tibio", "Frío", "Tibio"] as Temperature[])[i % 4], last: script.messages.at(-1)?.body ?? "Conversación nueva", time: i < 3 ? `${9 + i}:4${i}` : i < 9 ? "Ayer" : `${2 + (i % 5)} jul`, unread: i % 5 === 0 ? 2 : i % 4 === 0 ? 1 : 0, ai: i % 5 !== 3, transferred:i%6===3, closed:false, hasAppointment:i%8===0, score: 92 - ((i * 7) % 58), interest: ["Demo del producto", "Plan profesional", "Automatización de ventas", "Información general"][i % 4], stage: ["Oportunidad", "Calificado", "Nuevo", "Seguimiento"][i % 4], color: colors[i % colors.length], summary: script.summary, tags:i%3===0?["Plan Pro","Equipo"]:["Prospecto"], note:"", reminder:i%7===0?"Mañana, 10:00":"", messages: script.messages.map(message => ({ ...message })),
  };
});

const nav: { label: View; icon: string }[] = [
  { label: "Inicio", icon: "⌂" }, { label: "Conversaciones", icon: "◉" }, { label: "Contactos", icon: "♙" }, { label: "Entrenar IA", icon: "✦" }, { label: "Base de conocimiento", icon: "▣" },
  { label: "Productos y servicios", icon: "□" }, { label: "Conexiones", icon: "◎" }, { label: "Equipo", icon: "♟" }, { label: "Plan y facturación", icon: "◈" }, { label: "Configuración", icon: "⚙" },
];

export default function NexoApp() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [view, setView] = useState<View>("Inicio");
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | number>(1);
  const [toast, setToast] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [appointments, setAppointments] = useState<number>(DEMO_METRICS.appointments);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [modal, setModal] = useState(false);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    async function loadRealData() {
      try {
        const [dashboard, page] = await Promise.all([api.dashboard(), api.conversations(1)]);
        if (cancelled) return;
        setDashboardMetrics(dashboard);
        setAppointments(dashboard.appointments);
        const mapped = page.items.map(conversationFromApi);
        if (mapped.length) {
          setConversations(mapped);
          setActiveId(mapped[0].id);
        }
      } catch {
        notify("No se pudo sincronizar la API; se conserva la vista actual");
      }
    }
    void loadRealData();
    return () => { cancelled = true; };
  }, [loggedIn]);
  useEffect(() => {
    if (!loggedIn || typeof activeId !== "string") return;
    let cancelled = false;
    async function loadConversationDetail() {
      try {
        const item = await api.conversation(String(activeId));
        if (cancelled) return;
        setConversations(current => current.map((conversation, index) => conversation.id === activeId ? conversationFromApi(item, index) : conversation));
      } catch {
        notify("No se pudo cargar el detalle de la conversaciÃ³n");
      }
    }
    void loadConversationDetail();
    return () => { cancelled = true; };
  }, [loggedIn, activeId]);
  const logout = async () => {
    try { await api.logout(); }
    catch { /* La sesión pudo expirar antes de cerrar. */ }
    setLoggedIn(false);
    setView("Inicio");
    setConversations(initialConversations);
    setActiveId(1);
    setDashboardMetrics(null);
    setAppointments(DEMO_METRICS.appointments);
    setSidebar(false);
    setProfileMenu(false);
  };
  if (!loggedIn) return <Login onLogin={async(email,password) => { await api.login(email,password); setLoggedIn(true); }} onRegister={async(data) => { await api.register(data); setLoggedIn(true); }} />;
  const active = conversations.find(c => c.id === activeId) ?? conversations[0];
  const go = (v: View) => { setView(v); setSidebar(false); };

  return <div className="app-shell">
    <aside className={`sidebar ${sidebar ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark">n</span><span>next.io <span>by Mercadia</span></span></div>
      <button className="workspace"><span className="workspace-logo">NX</span><span><b>Mercadia Ops</b><small>Growth stack · Live data</small></span><span>⌄</span></button>
      <nav>{nav.map(item => <button key={item.label} className={view === item.label ? "active" : ""} onClick={() => go(item.label)}><i>{item.icon}</i>{item.label}{item.label === "Conversaciones" && <em>6</em>}</button>)}</nav>
      <div className="sidebar-bottom">
        <button className="demo-pill" onClick={() => notify("Sesión y base de datos conectadas")} aria-label="Datos persistentes conectados"><span /> Datos persistentes · API</button>
        <div className="profile-wrap"><button className="profile" onClick={() => setProfileMenu(!profileMenu)}><span className="avatar small">LN</span><span><b>Leniel</b><small>Administrador</small></span><span>•••</span></button>{profileMenu&&<div className="profile-menu"><button onClick={logout}>Cerrar sesión</button></div>}</div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={() => setSidebar(!sidebar)}>☰</button><div><h1>{view}</h1><p>{subtitle(view)}</p></div><div className="top-actions"><span className="status"><i /> Sistema operativo</span><button className="icon-button" onClick={() => notify("No tienes notificaciones nuevas")}>♢</button><button className="avatar">LN</button></div></header>
      <div className="content">
        {view === "Inicio" && <Dashboard onNavigate={go} appointments={appointments} metrics={dashboardMetrics} />}
        {view === "Conversaciones" && <Inbox conversations={conversations} setConversations={setConversations} active={active} setActiveId={setActiveId} notify={notify} onAppointment={() => setModal(true)} />}
        {view === "Contactos" && <Contacts conversations={conversations} onOpen={(id) => { setActiveId(id); go("Conversaciones"); }} />}
        {view === "Entrenar IA" && <AgentSettings notify={notify} />}
        {view === "Base de conocimiento" && <KnowledgeBase notify={notify} />}
        {view === "Productos y servicios" && <KnowledgeBase notify={notify} initialKind="products" commerceOnly />}
        {view === "Conexiones" && <Channels notify={notify} />}
        {view === "Equipo" && <Settings notify={notify} onSuper={() => go("Superadmin")} initialTab="Equipo y roles" />}
        {view === "Plan y facturación" && <Settings notify={notify} onSuper={() => go("Superadmin")} initialTab="Facturación" />}
        {view === "Configuración" && <Settings notify={notify} onSuper={() => go("Superadmin")} initialTab="Organización" />}
        {view === "Superadmin" && <Superadmin notify={notify} />}
      </div>
    </main>
    {toast && <div className="toast"><b>✓</b>{toast}</div>}
    {modal && <AppointmentModal contact={active.name} onClose={() => setModal(false)} onSave={() => { if(!active.hasAppointment)setAppointments(a => a + 1); setConversations(conversations.map(item=>item.id===active.id?{...item,hasAppointment:true,stage:"Cita",tags:Array.from(new Set([...item.tags,"Cita agendada"]))}:item)); setModal(false); notify("Cita agendada y enlace de Meet generado"); }} />}
  </div>;
}

function Login({ onLogin, onRegister }: { onLogin: (email:string,password:string) => Promise<void>; onRegister: (data:{name:string;email:string;password:string;businessName:string;plan:BillingPlan;interval:BillingInterval}) => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [mode,setMode]=useState<"login"|"register">("login");
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState("");
  const [name,setName]=useState(""); const [businessName,setBusinessName]=useState(""); const [plan,setPlan]=useState<BillingPlan>("PRO"); const [interval,setInterval]=useState<BillingInterval>("MONTHLY");
  const submit = async(e: FormEvent) => { e.preventDefault(); setLoading(true);setError("");try{mode==="login"?await onLogin(email,password):await onRegister({name,email,password,businessName,plan,interval})}catch(reason){setError(reason instanceof Error?reason.message:"No fue posible completar la solicitud");setLoading(false)} };
  return <div className="login-page"><div className="login-art"><div className="art-grid" /><div className="login-brand"><span className="brand-mark light">n</span>next.io <span>by Mercadia</span></div><div className="login-quote"><span>✦</span><h2>AI customer ops<br />para vender más rápido.</h2><p>Un inbox oscuro, rápido y conectado para responder, calificar y convertir conversaciones en revenue.</p><div className="channel-orbit"><b>IG</b><b>WA</b><b>FB</b><i /></div></div><small>Omnichannel AI stack for growth teams</small></div><div className="login-panel"><form onSubmit={submit} autoComplete="off"><span className="eyebrow">{mode==="login"?"SECURE WORKSPACE":"MVP ONBOARDING"}</span><h1>{mode==="login"?"Inicia sesión en next.io":"Crea tu cuenta"}</h1><p>{mode==="login"?"Accede a tu operación comercial y continúa tus conversaciones.":"Crea tu negocio, elige plan e inicia prueba gratis de 7 días."}</p>{mode==="register"&&<><label>Tu nombre<input name="register-name" value={name} onChange={event=>setName(event.target.value)} required /></label><label>Nombre del negocio<input name="register-business" value={businessName} onChange={event=>setBusinessName(event.target.value)} required /></label></>}<label>Correo electrónico<input type="email" name="login-email" autoComplete="off" value={email} onChange={event=>setEmail(event.target.value)} required /></label><label>Contraseña<div className="password"><input type="password" name="login-password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} required minLength={mode==="register"?10:8}/><span>◉</span></div></label>{mode==="register"&&<div className="form-grid compact"><label>Plan<select value={plan} onChange={event=>setPlan(event.target.value as BillingPlan)}><option value="STARTER">Starter</option><option value="PRO">Growth</option><option value="ENTERPRISE">Advanced</option></select></label><label>Periodo<select value={interval} onChange={event=>setInterval(event.target.value as BillingInterval)}><option value="MONTHLY">Mensual</option><option value="YEARLY">Anual</option></select></label></div>}{error&&<p role="alert" className="login-error">{error}</p>}<div className="form-row"><label className="check"><input type="checkbox" /> Recordarme</label><button type="button" className="link" onClick={()=>{setMode(mode==="login"?"register":"login");setError("")}}>{mode==="login"?"Crear cuenta":"Ya tengo cuenta"}</button></div><button className="primary login-submit" disabled={loading}>{loading ? "Procesando…" : mode==="login" ? "Iniciar sesión  →" : "Iniciar prueba gratis  →"}</button><div className="demo-box"><span>●</span><div><b>{mode==="login"?"Acceso conectado":"Trial real de 7 días"}</b><p>{mode==="login"?"La sesión se valida contra la API y la base de datos PostgreSQL.":"El backend crea usuario, negocio, membresía admin y suscripción trial."}</p></div></div><small className="legal">Al continuar, aceptas los Términos y el Aviso de privacidad.</small></form></div></div>;
}

function Dashboard({ onNavigate, appointments, metrics: realMetrics }: { onNavigate: (v: View) => void; appointments: number; metrics: DashboardMetrics | null }) {
  const conversations = realMetrics?.conversations ?? DEMO_METRICS.conversations;
  const newLeads = realMetrics?.newLeads ?? DEMO_METRICS.newLeads;
  const hotLeads = realMetrics?.hotLeads ?? DEMO_METRICS.hotLeads;
  const aiHandled = realMetrics?.aiHandled ?? DEMO_METRICS.handledByAI;
  const humanHandled = realMetrics?.humanHandled ?? DEMO_METRICS.transferredToHuman;
  const funnel = realMetrics?.funnel ?? { contacts: FUNNEL[0].value, contacted: FUNNEL[1].value, qualified: FUNNEL[2].value, hot: FUNNEL[3].value, appointments };
  const newRate = realMetrics?.conversion?.newLeadToAppointment ?? Number(((appointments/Math.max(1,newLeads))*100).toFixed(1));
  const hotRate = realMetrics?.conversion?.hotToAppointment ?? Number(((appointments/Math.max(1,hotLeads))*100).toFixed(1));
  const metrics = [{ label: "Conversaciones del mes", value: conversations.toLocaleString("es-MX"), trend: realMetrics ? "API" : "+18.2%", icon: "◉" }, { label: "Nuevos prospectos", value: newLeads.toString(), trend: realMetrics ? "API" : "+12.4%", icon: "♙" }, { label: "Prospectos calientes", value: hotLeads.toString(), trend: realMetrics ? "API" : "+24.8%", icon: "↗" }, { label: "Citas generadas", value: appointments.toString(), trend: realMetrics ? "API" : "+8.1%", icon: "□" }];
  return <><section className="welcome"><div><span className="eyebrow">MARTES, 21 DE JULIO</span><h2>Buenos días, Leniel <span>✦</span></h2><p>Tu agente de IA atendió <b>38 conversaciones</b> mientras no estabas.</p></div><button className="primary" onClick={() => onNavigate("Conversaciones")} aria-label="Abrir conversaciones">Ver conversaciones →</button></section>
    <div className="metric-grid">{metrics.map((m, i) => <article className="metric-card" key={m.label}><div className={`metric-icon c${i}`}>{m.icon}</div><span>{m.label}</span><h3>{m.value}</h3><small className="positive">↗ {m.trend}</small><small> vs. mes anterior</small></article>)}</div>
    <div className="dashboard-grid"><article className="card chart-card"><CardTitle title="Conversaciones" note={realMetrics ? "Distribución real por canal" : "Últimos 14 días · pasa el cursor para ver el detalle"} /><div className="chart-wrap"><div className="y-axis"><span>90</span><span>60</span><span>30</span><span>0</span></div><div className="bars stacked-bars">{DAILY_CHANNELS.map((day,i)=><div className="bar-col" key={day.date} title={`${day.date} · Instagram ${day.instagram} · WhatsApp ${day.whatsapp} · Facebook ${day.facebook} · Total ${day.total}`}><div className="stacked-bar" style={{height:`${Math.max(18,day.total*1.25)}px`}}><span className="segment facebook" style={{flex:day.facebook}}/><span className="segment whatsapp" style={{flex:day.whatsapp}}/><span className="segment instagram" style={{flex:day.instagram}}/></div><small>{i%2===0 ? day.date : ""}</small></div>)}</div></div><div className="legend">{(["instagram","whatsapp","facebook"] as Channel[]).map(channel=><span key={channel}><i className={channel==="instagram"?"ig":channel==="whatsapp"?"wa":"fb"} />{CHANNELS[channel].label} {realMetrics?.byChannel?.find(item=>channelFromApi(item.channel)===channel)?.percentage ?? CHANNEL_DATA[channel].percentage}%</span>)}</div></article>
      <article className="card funnel"><CardTitle title="Embudo de prospectos" note={realMetrics ? "Datos reales de PostgreSQL" : "Cada etapa explica su criterio"} />{[["Contactos", funnel.contacts],["Contactados", funnel.contacted],["Calificados", funnel.qualified],["Calientes", funnel.hot],["Citas", appointments]].map(([label,value])=><div className="funnel-row" key={label} title={`${label}: ${value}`}><b>{label}</b><div><i style={{width:`${Math.max(4,(Number(value)/Math.max(1,newLeads))*100)}%`}} /></div><strong>{value}</strong></div>)}<div className="conversion conversion-dual"><span>Nuevos → cita <b>{newRate}%</b></span><span>Calientes → cita <b>{hotRate}%</b></span></div></article>
    </div>
    <div className="dashboard-grid lower"><article className="card"><CardTitle title="Rendimiento de atención" note={realMetrics ? "Métricas reales del workspace" : "Métricas coherentes del mes"} /><div className="performance"><div><span>Atendidas por IA</span><b>{Math.round(aiHandled/Math.max(1,conversations)*100)}%</b><div><i style={{width:`${aiHandled/Math.max(1,conversations)*100}%`}} /></div><small>{aiHandled.toLocaleString("es-MX")} conversaciones</small></div><div><span>Transferidas a humano</span><b>{Math.round(humanHandled/Math.max(1,conversations)*100)}%</b><div><i style={{width:`${humanHandled/Math.max(1,conversations)*100}%`}} /></div><small>{humanHandled} conversaciones</small></div><div className="response-time"><span>◷</span><p>Primera respuesta promedio<b>{DEMO_METRICS.firstResponseSeconds} segundos</b></p><em>{DEMO_METRICS.savedHours} h ahorradas</em></div></div></article><article className="card"><CardTitle title="Actividad reciente" note="En tiempo real" action="Ver todo" /><div className="activity">{[["MR","Mariana respondió","Quiere agendar una demostración","Ahora","hot"],["IA","Lead calificado por IA","Carlos alcanzó 84 puntos","Hace 4 min","ai"],["WA","Nueva conversación","Sofía escribió por WhatsApp","Hace 12 min","wa"],["✓","Cita confirmada","Diego · Miércoles 11:30","Hace 26 min","ok"]].map(x=><div key={x[1]}><span className={x[4]}>{x[0]}</span><p><b>{x[1]}</b><small>{x[2]}</small></p><time>{x[3]}</time></div>)}</div></article></div>
  </>;
}

function Inbox({ conversations, setConversations, active, setActiveId, notify, onAppointment }: { conversations: Conversation[]; setConversations: (v: Conversation[]) => void; active: Conversation; setActiveId: (id:string | number)=>void; notify:(s:string)=>void; onAppointment:()=>void }) {
  const [filter, setFilter] = useState("Todos"); const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [noteDraft,setNoteDraft]=useState("");
  const filtered = useMemo(() => conversations.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) && (filter === "Todos" || CHANNELS[c.channel].label === filter || c.temperature === filter || (filter==="IA activa"&&c.ai) || (filter==="Pausadas"&&!c.ai) || (filter==="Humano"&&c.transferred) || (filter==="Con cita"&&c.hasAppointment))), [conversations, query, filter]);
  const update = (partial: Partial<Conversation>) => setConversations(conversations.map(c => c.id === active.id ? {...c, ...partial} : c));
  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    const now = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
    update({ messages: [...active.messages, { body, from: "human", time: now }], last: body, time: "Ahora", unread: 0 });
    setDraft("");
    if (typeof active.id === "string") {
      try {
        await api.sendMessage(active.id, body);
        notify("Mensaje guardado en la base de datos");
        return;
      } catch {
        notify("No se pudo guardar en API; se conserva localmente");
      }
    }
    notify("Mensaje enviado y conversación actualizada");
    window.setTimeout(()=>{
      const reply=body.toLowerCase().includes("cita")?"Sí, me funciona. ¿Qué horarios tienen disponibles?":"Gracias por la información. Lo revisaré con mi equipo.";
      const current=conversations.find(item=>item.id===active.id)??active;
      setConversations(conversations.map(item=>item.id===active.id?{...item,messages:[...current.messages,{body,from:"human",time:now},{body:reply,from:"contact",time:now}],last:reply,time:"Ahora",unread:1}:item));
      notify(`${active.name} respondió en la simulación`);
    },700);
  };
  const syncConversation = (item: ApiConversation) => setConversations(conversations.map((conversation, index)=>conversation.id===active.id?conversationFromApi(item,index):conversation));
  const take = async () => { if(typeof active.id!=="string"){update({transferred:true,ai:false});notify("Conversación tomada en modo local");return;} try{syncConversation(await api.takeConversation(active.id));notify("Conversación tomada. IA pausada.");}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo tomar la conversación");} };
  const returnToAi = async () => { if(typeof active.id!=="string"){update({transferred:false,ai:true});notify("Conversación devuelta a IA en modo local");return;} try{syncConversation(await api.returnConversationToAi(active.id));notify("Conversación devuelta a IA.");}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo devolver a IA");} };
  const close = async () => { if(typeof active.id!=="string"){update({closed:true,ai:false});notify("Conversación cerrada en modo local");return;} try{syncConversation(await api.closeConversation(active.id));notify("Conversación cerrada.");}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo cerrar la conversación");} };
  return <div className="inbox"><section className="thread-list"><div className="inbox-title"><div><h2>Conversaciones</h2><span>{conversations.reduce((sum,item)=>sum+item.unread,0)} sin leer</span></div><button onClick={()=>notify("Nueva conversación demo creada") } aria-label="Nueva conversación">＋</button></div><div className="search"><span>⌕</span><input aria-label="Buscar conversaciones" placeholder="Buscar conversaciones…" value={query} onChange={e=>setQuery(e.target.value)} /></div><div className="filters">{["Todos","Instagram","WhatsApp","Facebook","Frío","Tibio","Caliente","IA activa","Pausadas","Humano","Con cita"].map(f=><button className={filter===f?"active":""} onClick={()=>setFilter(f)} key={f}>{f}</button>)}</div><div className="threads">{filtered.length ? filtered.map(c=><button key={c.id} className={active.id===c.id?"active":""} onClick={()=>{setActiveId(c.id);setNoteDraft(c.note)}}><span className="avatar" style={{background:c.color}}>{c.initials}</span><span className="thread-copy"><b>{c.name}<i className={`channel ${c.channel}`}>{CHANNELS[c.channel].short}</i></b><small>{c.last}</small><em className={`temp ${c.temperature.toLowerCase()}`}>● {c.temperature}</em>{c.ai ? <em className="ai-label">✦ IA activa</em>:<em className="ai-label paused">Ⅱ IA pausada</em>}{c.transferred&&<em className="ai-label">Humano</em>}</span><span className="thread-meta"><time>{c.time}</time>{c.unread>0&&<b>{c.unread}</b>}</span></button>) : <div className="empty"><b>Sin resultados</b><span>Prueba con otro filtro.</span></div>}</div></section>
    <section className="chat"><div className="chat-head"><span className="avatar" style={{background:active.color}}>{active.initials}</span><div><b>{active.name}</b><span><i className="online" /> En línea · {CHANNELS[active.channel].label}</span></div><div className="chat-actions"><button onClick={()=>{update({ai:!active.ai});notify(active.ai?"IA pausada":"IA activada")}}>✦ {active.ai?"Pausar IA":"Activar IA"}</button><button className={active.transferred?"active":""} onClick={()=>{update({transferred:!active.transferred,ai:active.transferred?active.ai:false});notify(active.transferred?"Conversación devuelta a IA":"Conversación transferida a Leniel")}}>⇄ {active.transferred?"Devolver a IA":"Transferir"}</button><button aria-label="Más opciones">•••</button></div></div><div className="chat-note"><span>✦</span><p><b>Resumen de IA</b> {active.summary}</p></div><div className="messages"><div className="date-chip">HOY</div>{active.messages.map((message,i)=><div className={`bubble-row ${message.from === "contact" ? "in" : "out"}`} key={`${active.id}-${i}`}>{message.from === "contact"&&<span className="avatar tiny" style={{background:active.color}}>{active.initials}</span>}<div className="bubble">{message.from === "ai"&&<small>✦ Nia · IA</small>}{message.from === "human"&&<small>Leniel · Agente</small>}<p>{message.body}</p><time>{message.time} {message.from !== "contact"?"✓✓":""}</time></div></div>)}</div><div className="quick-replies"><button onClick={()=>setDraft("¿Te gustaría agendar una videollamada de 20 minutos?")}>Agendar videollamada</button><button onClick={()=>setDraft("Te comparto nuestros planes disponibles.")}>Compartir planes</button><button onClick={()=>setDraft("¿Hay algo más en lo que pueda ayudarte?")}>Cerrar conversación</button></div><div className="composer"><button aria-label="Adjuntar">＋</button><textarea aria-label="Mensaje" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Escribe un mensaje…" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}/><button aria-label="Emoji">☺</button><button className="send" onClick={send} aria-label="Enviar mensaje">➤</button><small>Enter para enviar · Respuesta humana</small></div></section>
    <aside className="contact-panel"><div className="contact-hero"><span className="avatar large" style={{background:active.color}}>{active.initials}</span><h3>{active.name}</h3><span><i className={`channel ${active.channel}`}>{CHANNELS[active.channel].short}</i> {CHANNELS[active.channel].label}</span></div><div className="score"><div><span>Puntuación del lead</span><b>{active.score}<small>/100</small></b></div><div className="score-track"><i style={{width:`${active.score}%`}}/></div><p>{active.temperature} · puntuación demostrativa</p></div><PanelBlock title="Clasificación"><div className="temperature-select">{(["Frío","Tibio","Caliente"] as Temperature[]).map(t=><button className={active.temperature===t?`active ${t.toLowerCase()}`:""} onClick={()=>{update({temperature:t});notify(`Clasificación cambiada a ${t}`)}} key={t}>● {t}</button>)}</div></PanelBlock><PanelBlock title="Detalles"><Detail label="Interés detectado" value={active.interest}/><Detail label="Etapa comercial" value={active.stage}/><Detail label="Último contacto" value={active.time}/><Detail label="Próxima acción" value={active.reminder||"Enviar propuesta"}/></PanelBlock><PanelBlock title="Etiquetas"><div className="tags">{active.tags.map(tag=><span key={tag}>{tag}</span>)}<button aria-label="Agregar etiqueta" onClick={()=>{const tag=window.prompt("Nombre de la etiqueta");if(tag?.trim()){update({tags:[...active.tags,tag.trim()]});notify("Etiqueta agregada")}}}>＋</button></div></PanelBlock><PanelBlock title="Recordatorio"><button className="reminder-button" onClick={()=>{update({reminder:"Mañana, 10:00"});notify("Recordatorio programado para mañana a las 10:00")}}>{active.reminder?`◷ ${active.reminder}`:"＋ Programar recordatorio"}</button></PanelBlock><PanelBlock title="Notas"><textarea key={active.id} value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder="Agregar una nota interna…"/><button className="link" onClick={()=>{update({note:noteDraft});notify("Nota guardada")}}>Guardar nota</button></PanelBlock><button className="appointment" onClick={onAppointment}>{active.hasAppointment?"✓ Cita agendada":"□ Agendar videollamada"}</button></aside>
  </div>;
}

function Contacts({ conversations, onOpen }: { conversations: Conversation[]; onOpen:(id:string | number)=>void }) { const [q,setQ]=useState(""); return <section className="page-stack"><div className="section-heading"><div><h2>Contactos y prospectos</h2><p>Todos tus contactos, unificados y calificados.</p></div><button className="primary">＋ Nuevo contacto</button></div><div className="card table-card"><div className="table-tools"><div className="search wide"><span>⌕</span><input placeholder="Buscar por nombre o canal…" value={q} onChange={e=>setQ(e.target.value)}/></div><button>Todos los canales ⌄</button><button>Temperatura ⌄</button></div><table><thead><tr><th>Contacto</th><th>Canal</th><th>Interés</th><th>Clasificación</th><th>Puntuación</th><th>Etapa</th><th>Último contacto</th><th/></tr></thead><tbody>{conversations.filter(c=>c.name.toLowerCase().includes(q.toLowerCase())).slice(0,12).map(c=><tr key={c.id}><td><span className="avatar small" style={{background:c.color}}>{c.initials}</span><b>{c.name}</b></td><td><i className={`channel ${c.channel}`}>{CHANNELS[c.channel].short}</i> {CHANNELS[c.channel].label}</td><td>{c.interest}</td><td><em className={`temp ${c.temperature.toLowerCase()}`}>● {c.temperature}</em></td><td><b>{c.score}</b>/100</td><td>{c.stage}</td><td>{c.time}</td><td><button className="link" onClick={()=>onOpen(c.id)}>Abrir →</button></td></tr>)}</tbody></table></div></section> }

const knowledgeConfig: Record<KnowledgeKind, KnowledgeConfig> = {
  faqs: { label: "FAQs", titleKey: "question", subtitleKey: "answer", create: () => ({ question: "¿Cómo funciona next.io?", answer: "Centraliza conversaciones, califica prospectos y prepara respuestas para tu equipo.", active: true }) },
  products: { label: "Productos", titleKey: "name", subtitleKey: "description", create: () => ({ sku: `NX-${Date.now()}`, name: "Producto nuevo", description: "Producto conectado a la base de conocimiento.", price: 0, currency: "MXN", active: true }) },
  services: { label: "Servicios", titleKey: "name", subtitleKey: "description", create: () => ({ code: `SRV-${Date.now()}`, name: "Servicio nuevo", description: "Servicio disponible para respuestas comerciales.", price: 0, currency: "MXN", durationMinutes: 30, active: true }) },
  promotions: { label: "Promociones", titleKey: "name", subtitleKey: "description", create: () => ({ code: `PROMO-${Date.now()}`, name: "Promoción nueva", description: "Oferta temporal para campañas comerciales.", discountType: "PERCENTAGE", discountValue: 10, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 7 * 86400000).toISOString(), active: true }) },
  schedules: { label: "Horarios", titleKey: "name", subtitleKey: "timezone", create: () => ({ name: "Horario comercial", timezone: "America/Mexico_City", active: true, entries: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map(dayOfWeek => ({ dayOfWeek, opensAt: "09:00", closesAt: "18:00" })) }) },
  policies: { label: "Políticas", titleKey: "title", subtitleKey: "content", create: () => ({ type: "CUSTOM", title: "Política nueva", content: "Contenido operativo disponible para el agente y el equipo.", version: 1, active: true }) },
};
const knowledgeKinds = Object.keys(knowledgeConfig) as KnowledgeKind[];
const recordValue = (record: KnowledgeRecord, ...keys: string[]) => keys.map(key => record[key]).find(value => typeof value === "string" && value.trim()) as string | undefined;
const moneyValue = (record: KnowledgeRecord) => typeof record.price === "number" ? `${record.currency ?? "MXN"} ${record.price.toLocaleString("es-MX")}` : "";

function KnowledgeBase({notify,initialKind="faqs",commerceOnly=false}:{notify:(s:string)=>void;initialKind?:KnowledgeKind;commerceOnly?:boolean}) {
  const [kind,setKind]=useState<KnowledgeKind>(initialKind);
  const [search,setSearch]=useState("");
  const [items,setItems]=useState<KnowledgeRecord[]>([]);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const config=knowledgeConfig[kind];
  const visibleKinds = commerceOnly ? (["products","services"] as KnowledgeKind[]) : knowledgeKinds.filter(item=>!["products","services"].includes(item));
  const load=async()=>{setLoading(true);try{const page=await api.knowledgeList(kind,search);setItems(page.items);setTotal(page.total)}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo cargar Knowledge Base")}finally{setLoading(false)}};
  useEffect(()=>{void load()},[kind,search]);
  const create=async()=>{try{await api.knowledgeCreate(kind,config.create());notify(`${config.label}: registro creado`);await load()}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo crear el registro")}};
  const rename=async(item:KnowledgeRecord)=>{const current=recordValue(item,config.titleKey,"name","title","question","code","sku")??"";const next=window.prompt("Nuevo texto principal",current);if(!next?.trim())return;try{await api.knowledgeUpdate(kind,item.id,{[config.titleKey]:next.trim()});notify("Registro actualizado");await load()}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo actualizar")}};
  const toggle=async(item:KnowledgeRecord)=>{try{await api.knowledgeUpdate(kind,item.id,{active:item.active===false});notify(item.active===false?"Registro activado":"Registro pausado");await load()}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo cambiar el estado")}};
  const remove=async(item:KnowledgeRecord)=>{if(!window.confirm("¿Eliminar este registro? Se aplicará soft delete."))return;try{await api.knowledgeDelete(kind,item.id);notify("Registro eliminado con soft delete");await load()}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo eliminar")}};
  return <section className="page-stack knowledge-page"><div className="section-heading"><div><span className="eyebrow">FASE 6 · DATA OPERATIVA</span><h2>{commerceOnly?"Productos y servicios":"Base de conocimiento"}</h2><p>FAQs, productos, servicios, promociones, horarios y políticas conectados a PostgreSQL.</p></div><button className="primary" onClick={create}>＋ Nuevo {config.label}</button></div><div className="card knowledge-shell"><div className="knowledge-tabs">{visibleKinds.map(item=><button className={kind===item?"active":""} onClick={()=>setKind(item)} key={item}>{knowledgeConfig[item].label}</button>)}</div><div className="table-tools"><div className="search wide"><span>⌕</span><input placeholder={`Buscar en ${config.label}…`} value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="knowledge-count">{loading?"Sincronizando…":`${total} registros`}</span></div><div className="knowledge-list">{items.length?items.map(item=>{const title=recordValue(item,config.titleKey,"question","name","title","code","sku")??item.id;const subtitle=recordValue(item,config.subtitleKey,"answer","description","content","timezone")??moneyValue(item)??"Sin descripción";return <article className="knowledge-row" key={item.id}><span className={`knowledge-status ${item.active===false?"off":"on"}`}>{item.active===false?"Pausado":"Activo"}</span><div><b>{title}</b><p>{subtitle}</p><small>{moneyValue(item) || `ID ${item.id.slice(0,8)}`}</small></div><div className="knowledge-actions"><button onClick={()=>rename(item)}>Editar</button><button onClick={()=>toggle(item)}>{item.active===false?"Activar":"Pausar"}</button><button onClick={()=>remove(item)}>Eliminar</button></div></article>}):<div className="empty"><b>{loading?"Cargando…":"Sin registros"}</b><span>Crea un registro o cambia tu búsqueda.</span></div>}</div></div></section>
}

function Automations({notify}:{notify:(s:string)=>void}) {
  const [rules,setRules]=useState<AutomationRule[]>(DEMO_AUTOMATIONS.map(rule=>({...rule,channel:rule.channel as Channel})));
  const [creating,setCreating]=useState(false);
  return <section className="page-stack"><div className="section-heading"><div><h2>Automatizaciones</h2><p>Convierte interacciones en acciones sin trabajo manual.</p></div><button className="primary" onClick={()=>setCreating(true)}>＋ Nueva automatización</button></div>{creating&&<div className="card automation-builder"><h3>Nueva regla por palabra clave</h3><div className="form-grid"><label>Nombre<input defaultValue="Solicitud desde comentario"/></label><label>Canal<select><option>Instagram</option><option>Facebook</option><option>WhatsApp</option></select></label><label>Si el mensaje contiene<input defaultValue="DEMO"/></label><label>Entonces<select><option>Enviar mensaje privado</option><option>Agregar etiqueta</option><option>Avisar a un asesor</option></select></label></div><div className="button-row"><button onClick={()=>setCreating(false)}>Cancelar</button><button className="primary" onClick={()=>{setRules([{name:"Solicitud desde comentario",channel:"instagram",trigger:'Comentario contiene “DEMO”',action:"Iniciar calificación",runs:0,active:true},...rules]);setCreating(false);notify("Automatización creada y activada")}}>Crear automatización</button></div></div>}<div className="automation-grid">{rules.map((rule,i)=><article className="card automation-card" key={`${rule.name}-${i}`}><div className="automation-top"><i className={`channel ${rule.channel}`}>{CHANNELS[rule.channel].short}</i><button aria-label={`${rule.active?"Desactivar":"Activar"} ${rule.name}`} className={`switch ${rule.active?"on":""}`} onClick={()=>{setRules(rules.map((item,j)=>j===i?{...item,active:!item.active}:item));notify(rule.active?"Automatización desactivada":"Automatización activada")}}><span/></button></div><h3>{rule.name}</h3><p><span>CUANDO</span>{rule.trigger}</p><p><span>ENTONCES</span>{rule.action}</p><div className="automation-footer"><span><b>{rule.runs}</b> ejecuciones</span><span>{rule.runs?"Última: hoy":"Sin ejecuciones"}</span></div><div className="automation-actions"><button onClick={()=>{const name=window.prompt("Editar nombre",rule.name);if(name?.trim())setRules(rules.map((item,j)=>j===i?{...item,name:name.trim()}:item))}}>Editar</button><button onClick={()=>{setRules(rules.map((item,j)=>j===i?{...item,runs:item.runs+1}:item));notify(`Prueba ejecutada: ${rule.action}`)}}>▶ Probar</button></div></article>)}</div></section>
}

function AgentSettings({notify,onTest}:{notify:(s:string)=>void;onTest?:()=>void}) {
  const defaultPrompt=`Eres Nia, asistente comercial de Áurea Labs. Tu objetivo es entender la necesidad del prospecto, calificar su interés y facilitar una videollamada cuando exista intención suficiente.\n\nResponde de forma cercana y profesional, con máximo tres oraciones. Haz una sola pregunta por mensaje. No insistas si la persona no está interesada. Transfiere casos sensibles o urgentes a una persona. En temas de salud, no diagnostiques ni recomiendes tratamientos.`;
  const [prompt,setPrompt]=useState(defaultPrompt);
  const [status,setStatus]=useState<"Borrador"|"Publicado">("Publicado");
  const tokens=Math.max(1,Math.ceil(prompt.length/4));
  const save = async (publish:boolean) => { try { await api.savePrompt("Nia", prompt, publish); setStatus(publish?"Publicado":"Borrador"); notify(publish?"Prompt publicado en backend":"Borrador guardado en backend"); } catch(reason) { notify(reason instanceof Error?reason.message:"No se pudo guardar el prompt"); } };
  return <section className="page-stack"><div className="section-heading"><div><h2>Entrenar IA</h2><p>Configura cómo debe responder la IA de este negocio.</p></div><div className="button-row"><button onClick={()=>save(false)}>Guardar borrador</button><button onClick={()=>onTest?onTest():notify("Simulador de IA queda para la fase de proveedor mock centralizado")}>Probar prompt</button><button className="primary" onClick={()=>save(true)}>Publicar</button></div></div><div className="two-col"><div className="card form-card"><div className="agent-profile"><span className="agent-avatar">✦</span><div><h3>Nia</h3><span><i/> {status} · {tokens} tokens aprox.</span></div></div><label>Nombre del agente<input defaultValue="Nia"/></label><label>Prompt general<textarea className="prompt prompt-general" value={prompt} onChange={event=>{setPrompt(event.target.value);setStatus("Borrador")}} aria-label="Prompt general"/></label><div className="prompt-meta"><span>{prompt.length} caracteres</span><span>{tokens} tokens aproximados</span></div></div><aside className="page-stack"><div className="card version-list"><CardTitle title="Historial de versiones" note="Cambios recientes"/>{[["v4",status,"Ahora"],["v3","Publicado","Hoy, 09:42"],["v2","Mayor calidez","14 jul, 16:20"],["v1","Versión inicial","2 jul, 11:05"]].map(v=><div key={v[0]}><b>{v[0]}</b><p><strong>{v[1]}</strong><span>{v[2]}</span></p><button onClick={()=>notify(`${v[0]} seleccionada`)}>Ver</button></div>)}</div><div className="safety-card"><span>⚕</span><div><b>Protección para temas sensibles</b><p>Las reglas de seguridad se aplican también en modo demostración.</p></div></div></aside></div></section>
}

function Laboratory({notify}:{notify:(s:string)=>void}) {
  const [channel,setChannel]=useState<Channel>("instagram");
  const [input,setInput]=useState("");
  const [chat,setChat]=useState<{body:string;role:"user"|"agent"}[]>([]);
  const userTurns = chat.filter(message => message.role === "user").length;
  const completed = chat.filter(message => message.role === "agent").length >= 3;
  const send=async()=>{
    const text=input.trim();
    if(!text || completed)return;
    const turn=userTurns;
    setChat(current=>[...current,{body:text,role:"user"}]);
    setInput("");
    try {
      const result = await api.simulateAi(text, channel, turn);
      setChat(current=>[...current,{body:result.reply,role:"agent"}]);
      notify(`IA ${result.provider} respondio con ${result.model}`);
      return;
    } catch {
      notify("Simulador API no disponible; usando respuesta local");
    }
    if(turn===0){
      window.setTimeout(()=>setChat(current=>[...current,{body:"Gracias por contactarnos. ¿Te gustaría ver cómo funciona en una videollamada breve?",role:"agent"}]),450);
      return;
    }
    window.setTimeout(()=>setChat(current=>[...current,{body:"Perfecto. Tenemos disponibilidad el jueves a las 11:30 o a las 16:00.",role:"agent"}]),450);
    window.setTimeout(()=>setChat(current=>[...current,{body:"Listo: dejamos preparada tu solicitud de demostración. Un asesor te confirmará el horario y el enlace.",role:"agent"}]),950);
  };
  return <section className="lab-page"><div className="lab-header"><div><span className="eyebrow">ENTORNO DE PRUEBAS</span><h2>Laboratorio del agente</h2><p>Ajusta el comportamiento y prueba respuestas antes de publicar.</p></div><div><button onClick={()=>{setChat([]);setInput("");notify("Conversación restablecida")}}>↻ Restablecer</button><button className="primary" onClick={()=>notify("Prompt guardado y publicado")}>Guardar y publicar</button></div></div><div className="lab-grid"><div className="card lab-editor"><CardTitle title="Configuración de prueba" note="Los cambios no afectan al agente publicado"/><div className="form-grid"><label>Tono<select><option>Cercano y profesional</option></select></label><label>Proveedor y modelo<select><option>Simulado · Nexo Demo</option><option>OpenAI · GPT-5 mini</option></select></label></div><label>Objetivo<input defaultValue="Calificar y agendar una videollamada"/></label><label>Prompt del sistema<textarea className="prompt" defaultValue="Eres Nia, asistente comercial de Áurea Labs. Responde de forma natural, breve y útil. Haz una sola pregunta por mensaje. Identifica interés, urgencia e intención."/></label><label>Reglas<textarea defaultValue={'• Máximo 3 oraciones\n• No insistir si la persona no está interesada\n• Transferir temas sensibles o urgentes\n• No diagnosticar en conversaciones de salud'}/></label><div className="business-data"><b>Datos simulados del negocio</b><div><span>Empresa<em>Áurea Labs</em></span><span>Servicio<em>Automatización comercial</em></span><span>Horario<em>09:00–18:00</em></span></div></div></div><div className="phone-side"><div className="channel-tabs">{(["instagram","whatsapp","facebook"] as Channel[]).map(c=><button className={channel===c?`active ${c}`:""} onClick={()=>setChannel(c)} key={c}><i className={`channel ${c}`}>{CHANNELS[c].short}</i>{CHANNELS[c].label}</button>)}</div><div className={`phone ${channel}`}><div className="phone-notch"/><div className="phone-head"><span>‹</span><span className="agent-avatar mini">✦</span><p><b>Áurea Labs</b><small>Activo ahora</small></p><span>•••</span></div><div className="phone-chat">{chat.length?chat.map((message,i)=><div className={`phone-bubble ${message.role}`} key={i}>{message.body}{message.role==="agent"&&<small>✦ Respondió Nia</small>}</div>):<div className="empty"><b>Conversación nueva</b><span>Escribe “Hola” para comenzar la simulación.</span></div>}{completed&&chat.at(-1)?.role==="agent"&&<div className="lab-complete">✓ Simulación completada</div>}</div><div className="phone-input"><input value={input} disabled={completed} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder={completed?"Simulación finalizada":"Escribe un mensaje…"}/><button onClick={send} disabled={completed}>➤</button></div></div><div className="analysis-strip"><div><span>Intención</span><b>{completed?"Solicita demostración":"Explorando"}</b></div><div><span>Temperatura</span><b className="warm">● {completed?"Caliente":"Tibio"}</b></div><div><span>Acción sugerida</span><b>{completed?"Dar seguimiento":"Continuar calificando"}</b></div></div></div></div></section>
}

function Statistics(){const aiRate=Math.round(DEMO_METRICS.handledByAI/DEMO_METRICS.conversations*100);return <section className="page-stack"><div className="section-heading"><div><h2>Estadísticas</h2><p>Las mismas cifras del dashboard, con mayor detalle.</p></div><button onClick={()=>window.alert("Reporte demo preparado")}>Exportar reporte ↓</button></div><div className="metric-grid"><article className="metric-card"><span>Atención por IA</span><h3>{aiRate}%</h3><small>{DEMO_METRICS.handledByAI.toLocaleString("es-MX")} conversaciones</small></article><article className="metric-card"><span>Conversión nuevo → cita</span><h3>{newLeadToAppointmentRate}%</h3><small>{DEMO_METRICS.appointments} de {DEMO_METRICS.newLeads}</small></article><article className="metric-card"><span>Primera respuesta</span><h3>{DEMO_METRICS.firstResponseSeconds} s</h3><small>promedio del mes</small></article><article className="metric-card"><span>Tiempo ahorrado</span><h3>{DEMO_METRICS.savedHours} h</h3><small>estimación demo</small></article></div><div className="two-col stats"><article className="card"><CardTitle title="Volumen por canal" note={`${DEMO_METRICS.conversations.toLocaleString("es-MX")} conversaciones · 100%`}/><div className="donut-row"><div className="donut"><span><b>{DEMO_METRICS.conversations.toLocaleString("es-MX")}</b>Total</span></div><div className="donut-legend">{(["instagram","whatsapp","facebook"] as Channel[]).map(channel=><p key={channel}><i className={channel==="instagram"?"ig":channel==="whatsapp"?"wa":"fb"}/><span>{CHANNEL_DATA[channel].label}<small>{CHANNEL_DATA[channel].count} conversaciones</small></span><b>{CHANNEL_DATA[channel].percentage}%</b></p>)}</div></div></article><article className="card"><CardTitle title="Embudo y operación" note="Datos demostrativos consistentes"/><div className="stats-list"><p><span>Prospectos fríos / tibios / calientes</span><b>87 / 171 / 89</b></p><p><span>Calientes → cita</span><b>{hotLeadToAppointmentRate}%</b></p><p><span>Automatizaciones ejecutadas</span><b>{DEMO_METRICS.automationsRun}</b></p><p><span>IA / humano</span><b>{DEMO_METRICS.handledByAI} / {DEMO_METRICS.transferredToHuman}</b></p><p><span>Tokens simulados</span><b>{((DEMO_METRICS.inputTokens+DEMO_METRICS.outputTokens)/1_000_000).toFixed(2)} M</b></p></div></article></div><div className="card"><CardTitle title="Horas con mayor actividad" note="Promedio semanal"/><div className="heatmap">{Array.from({length:35}).map((_,i)=><i key={i} style={{opacity:.18+((i*7)%10)/12}} title={`Actividad demo ${18+((i*7)%10)*6}%`}/> )}</div><div className="heat-labels"><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span><span>21:00</span></div></div></section>}

function Channels({notify}:{notify:(s:string)=>void}){
  const [connected,setConnected]=useState<Record<Channel,boolean>>({instagram:true,whatsapp:true,facebook:true});
  return <section className="page-stack"><div className="section-heading"><div><h2>Canales</h2><p>Administra los puntos de contacto de tu organización.</p></div><span className="demo-banner"><i/> Modo demostración · Sin cuentas reales conectadas</span></div><div className="channel-cards">{(["instagram","whatsapp","facebook"] as Channel[]).map((channel,i)=><article className="card channel-card" key={channel}><div><i className={`channel huge ${channel}`}>{CHANNELS[channel].short}</i><span><h3>{CHANNELS[channel].label}</h3><p>{i===0?"Direct y comentarios":i===1?"WhatsApp Cloud API":"Messenger y comentarios"}</p></span></div><span className="simulated">● Conexión simulada</span><div className="channel-details"><p><span>Cuenta demo</span><b>{i===0?"@aurealabs_demo":i===1?"+52 55 0000 2026":"Áurea Labs Demo"}</b></p><p><span>Última sincronización</span><b>Hoy, 12:42</b></p></div><dl><div><dt>Conversaciones</dt><dd>{CHANNEL_DATA[channel].count}</dd></div><div><dt>Estado demo</dt><dd className={connected[channel]?"positive":""}>{connected[channel]?"Operativo":"Desconectado"}</dd></div></dl><button onClick={()=>notify(`Conexión simulada de ${CHANNELS[channel].label} verificada`)}>Probar conexión</button><button onClick={()=>notify(`${CHANNELS[channel].label}: eventos recientes abiertos (3 eventos demo)`) }>Ver eventos recientes</button><button className="primary" onClick={()=>{setConnected({...connected,[channel]:!connected[channel]});notify(connected[channel]?"Canal demo desconectado":"Canal demo reconectado")}}>{connected[channel]?"Desconectar demo":"Reconectar demo"}</button></article>)}</div><div className="card meta-ready"><span>◎</span><div><h3>Arquitectura preparada para Meta</h3><p>Los adaptadores, webhooks, validación de firma, idempotencia y reintentos están especificados. Ninguna solicitud real se realiza en esta demo.</p></div><button onClick={()=>notify("Documentación de integración disponible en el repositorio")}>Ver documentación →</button></div></section>
}

function Settings({notify,onSuper,initialTab="Organización"}:{notify:(s:string)=>void;onSuper:()=>void;initialTab?:SettingsTab}){
  const [tab,setTab]=useState<SettingsTab>(initialTab);
  const save=()=>notify(`${tab}: cambios guardados`);
  return <section className="page-stack"><div className="section-heading"><div><h2>Configuración</h2><p>Gestiona tu organización, equipo y preferencias.</p></div></div><div className="settings-grid"><div className="card settings-nav">{settingsTabs.map(item=><button className={tab===item?"active":""} onClick={()=>setTab(item)} key={item}>{item}</button>)}</div><div className="card form-card settings-content">
    {tab==="Organización"&&<><h3>Información de la organización</h3><div className="org-logo">AL <button>✎</button></div><div className="form-grid"><label>Nombre<input defaultValue="Áurea Labs"/></label><label>Zona horaria<select><option>Ciudad de México (UTC−6)</option></select></label><label>Industria<input defaultValue="Servicios profesionales"/></label><label>Sitio web<input defaultValue="https://aurealabs.demo"/></label></div><label>Descripción<textarea defaultValue="Ayudamos a empresas a mejorar su atención y automatizar procesos comerciales."/></label><div className="button-row end"><button className="primary" onClick={save}>Guardar cambios</button></div><hr/><div className="admin-access"><div><b>Panel privado de plataforma</b><p>Disponible únicamente para superadministradores.</p></div><button onClick={onSuper}>Abrir Superadmin →</button></div></>}
    {tab==="Equipo y roles"&&<><CardTitle title="Equipo y roles" note="4 miembros activos · 1 invitación pendiente" action="＋ Invitar miembro"/><div className="team-list">{[["LN","Leniel","leniel@mercadia.local","Administrador"],["JR","Javier Ruiz","javier@aurealabs.demo","Supervisor"],["AS","Andrea Soto","andrea@aurealabs.demo","Agente"],["MP","Mario Pérez","mario@aurealabs.demo","Agente"]].map(member=><div key={member[2]}><span className="avatar small">{member[0]}</span><p><b>{member[1]}</b><small>{member[2]}</small></p><select defaultValue={member[3]}><option>Administrador</option><option>Supervisor</option><option>Agente</option></select><button onClick={()=>notify(`Opciones de ${member[1]}`)}>•••</button></div>)}</div><div className="button-row"><button className="primary" onClick={save}>Guardar roles</button></div></>}
    {tab==="Notificaciones"&&<><CardTitle title="Notificaciones" note="Elige qué eventos avisan a tu equipo"/><ChannelToggle label="Nuevo prospecto caliente" color="instagram"/><ChannelToggle label="Conversación transferida" color="whatsapp"/><ChannelToggle label="Cita confirmada" color="facebook"/><ChannelToggle label="Canal desconectado" color="instagram"/><div className="form-grid"><label>Resumen por correo<select><option>Diario a las 18:00</option><option>Semanal</option><option>No enviar</option></select></label><label>Correo de avisos<input defaultValue="equipo@aurealabs.demo"/></label></div><div className="button-row"><button className="primary" onClick={save}>Guardar notificaciones</button></div></>}
    {tab==="Horarios"&&<><CardTitle title="Horarios de atención" note="Fuera de horario, Nia toma el mensaje y programa seguimiento"/><div className="schedule-list">{["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].map((day,i)=><div key={day}><span>{day}</span><button className={`switch ${i<5?"on":""}`}><span/></button>{i<5?<><input type="time" defaultValue="09:00"/><em>—</em><input type="time" defaultValue="18:00"/></>:<b>Cerrado</b>}</div>)}</div><label>Mensaje fuera de horario<textarea defaultValue="Gracias por escribirnos. En este momento estamos fuera de horario, pero registré tu mensaje y te contactaremos al iniciar la jornada."/></label><div className="button-row"><button className="primary" onClick={save}>Guardar horarios</button></div></>}
    {tab==="Seguridad"&&<><CardTitle title="Seguridad" note="Protege el acceso a la organización"/><div className="security-box"><div><span>✓</span><p><b>Autenticación en dos pasos</b><small>Solicita un código adicional al iniciar sesión.</small></p><button className="switch on"><span/></button></div><div><span>⌁</span><p><b>Sesiones activas</b><small>Chrome en Windows · Ciudad de México · Ahora</small></p><button onClick={()=>notify("Las demás sesiones fueron cerradas")}>Cerrar otras</button></div><div><span>▣</span><p><b>Registro de actividad</b><small>Último cambio administrativo: hoy, 12:42</small></p><button onClick={()=>notify("Registro de actividad abierto")}>Ver registro</button></div></div><div className="form-grid"><label>Nueva contraseña<input type="password" placeholder="Mínimo 12 caracteres"/></label><label>Confirmar contraseña<input type="password" placeholder="Repite la contraseña"/></label></div><div className="button-row"><button className="primary" onClick={save}>Actualizar seguridad</button></div></>}
    {tab==="Facturación"&&<BillingPanel notify={notify}/>}
  </div></div></section>
}

const planName = (plan: string) => plan === "STARTER" ? "Starter" : plan === "PRO" ? "Growth" : "Advanced";
const intervalName = (interval: string) => interval === "YEARLY" ? "anual" : "mensual";
const priceText = (plan: Pick<PlanPrice,"amountCents"|"currency"|"interval">) => `${plan.currency} ${(plan.amountCents/100).toLocaleString("es-MX")}${plan.interval==="YEARLY"?"/año":"/mes"}`;

function BillingPanel({notify}:{notify:(s:string)=>void}) {
  const [plans,setPlans]=useState<PlanPrice[]>([]);
  const [subscription,setSubscription]=useState<SubscriptionInfo|null>(null);
  const [usage,setUsage]=useState<BillingUsage|null>(null);
  const [interval,setInterval]=useState<"MONTHLY"|"YEARLY">("MONTHLY");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{let cancelled=false;async function load(){setLoading(true);try{const [planList,current,currentUsage]=await Promise.all([api.billingPlans(),api.billingSubscription(),api.billingUsage()]);if(cancelled)return;setPlans(planList);setSubscription(current);setUsage(currentUsage);setInterval(current.planPrice.interval)}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo cargar facturación")}finally{if(!cancelled)setLoading(false)}}void load();return()=>{cancelled=true}},[]);
  const visiblePlans=plans.filter(plan=>plan.interval===interval);
  const checkout=async(plan:PlanPrice)=>{try{const result=await api.billingCheckout(plan.id);notify(result.checkoutUrl?`Abriendo Stripe para ${planName(plan.plan)}`:result.message)}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo preparar checkout")}};
  if(loading&&!subscription)return <div className="empty"><b>Cargando facturación…</b><span>Sincronizando trial, uso y planes.</span></div>;
  return <><div className="billing-hero"><div><span>{subscription?.status==="TRIALING"?"PRUEBA ACTIVA DE 7 DÍAS":"PLAN ACTUAL"}</span><h3>{subscription?planName(subscription.planPrice.plan):"Growth"}</h3><p>{subscription?.status==="TRIALING"?`Quedan ${subscription.trialDaysLeft} días de prueba. Después eliges plan y método de pago.`:"Suscripción activa conectada a la organización."}</p></div><b>{subscription?priceText(subscription.planPrice):"$0"}<small> · {subscription?intervalName(subscription.planPrice.interval):"trial"}</small></b></div><div className="usage-row"><span>Conversaciones del periodo <b>{usage?.conversations??0} de {usage?.monthlyContactsLimit??subscription?.planPrice.monthlyContactsLimit??0}</b></span><div><i style={{width:`${usage?.percent??0}%`}}/></div></div><div className="billing-toggle"><button className={interval==="MONTHLY"?"active":""} onClick={()=>setInterval("MONTHLY")}>Mensual</button><button className={interval==="YEARLY"?"active":""} onClick={()=>setInterval("YEARLY")}>Anual · ahorra hasta 20%</button></div><div className="pricing-grid">{visiblePlans.map(plan=><article className={`pricing-card ${subscription?.planPrice.id===plan.id?"current":""}`} key={plan.id}><span>{subscription?.planPrice.id===plan.id?"Plan actual":"Disponible"}</span><h3>{planName(plan.plan)}</h3><b>{priceText(plan)}</b><p>{plan.monthlyContactsLimit.toLocaleString("es-MX")} contactos/mes · {plan.seatsLimit} miembros.</p><button className={subscription?.planPrice.id===plan.id?"":"primary"} onClick={()=>checkout(plan)}>{subscription?.planPrice.id===plan.id?"Configurar Stripe":"Elegir plan"}</button></article>)}</div><div className="invoice-list"><h4>Estado de pagos</h4>{[["Trial 7 días","$0 MXN","Activo"],["Stripe Checkout","Pendiente de claves","Preparado"],["Webhooks Stripe","Pendiente","Fase siguiente"]].map(row=><div key={row[0]}><span>{row[0]}</span><b>{row[1]}</b><em>{row[2]}</em><button onClick={()=>notify(`${row[0]} revisado`)}>Ver</button></div>)}</div></>
}

function Superadmin({notify}:{notify:(s:string)=>void}) {const [provider,setProvider]=useState("Proveedor simulado");return <section className="page-stack"><div className="section-heading"><div><span className="eyebrow">ACCESO PRIVADO · SUPERADMIN</span><h2>Proveedores de inteligencia artificial</h2><p>Cambia modelos, controla costos y prueba conexiones sin desplegar código.</p></div><span className="secure">⌾ Acceso protegido</span></div><div className="metric-grid"><article className="metric-card"><span>Tokens de entrada</span><h3>2.4 M</h3><small>Julio 2026</small></article><article className="metric-card"><span>Tokens de salida</span><h3>486 K</h3><small>Julio 2026</small></article><article className="metric-card"><span>Costo estimado</span><h3>$38.42</h3><small>USD este mes</small></article><article className="metric-card"><span>Presupuesto utilizado</span><h3>38%</h3><small>de $100 USD</small></article></div><div className="two-col"><div className="card form-card"><CardTitle title="Configuración principal" note="Las claves nunca son visibles para clientes"/><label>Proveedor principal<select value={provider} onChange={e=>setProvider(e.target.value)}>{["Proveedor simulado","OpenAI","DeepSeek","Qwen compatible","OpenRouter","Ollama / vLLM"].map(p=><option key={p}>{p}</option>)}</select></label><label>Modelo<input value={provider==="Proveedor simulado"?"nexo-demo-v1":"modelo-configurado"} readOnly/></label><label>URL base<input defaultValue="https://api.proveedor.com/v1"/></label><label>API key<div className="password"><input value="••••••••••••••••••••" readOnly/><span>🔒</span></div></label><div className="form-grid"><label>Límite de salida<input type="number" defaultValue="350"/></label><label>Timeout (ms)<input type="number" defaultValue="30000"/></label></div><div className="button-row"><button onClick={()=>notify("Conexión de prueba exitosa")}>Probar conexión</button><button className="primary" onClick={()=>notify("Proveedor principal actualizado")}>Guardar configuración</button></div></div><div className="card provider-list"><CardTitle title="Proveedores disponibles" note="Activos y respaldo"/>{["Proveedor simulado","OpenAI","DeepSeek","OpenRouter","Qwen compatible","Ollama / vLLM"].map((p,i)=><div key={p}><span className="provider-logo">{p[0]}</span><p><b>{p}</b><small>{i===0?"Predeterminado · Sin costo":i===1?"Respaldo · Configurado":"Sin configurar"}</small></p><button className={`switch ${i<2?"on":""}`}><span/></button></div>)}</div></div><div className="card compare"><CardTitle title="Comparar modelos" note="Envía el mismo mensaje a dos proveedores" action="Ejecutar comparación →"/><div className="compare-grid"><label>Mensaje de prueba<textarea defaultValue="Hola, quiero saber cuánto cuesta y si pueden darme una demostración."/></label><div><span>Modelo A<em>Proveedor simulado</em></span><p>¡Hola! El precio depende del volumen de conversaciones. ¿Cuántos mensajes reciben aproximadamente al mes?</p></div><div><span>Modelo B<em>OpenAI · Respaldo</em></span><p>Con gusto te comparto los planes. Para recomendarte el adecuado, ¿cuántas conversaciones atienden al mes?</p></div></div></div></section>}

function AppointmentModal({contact,onClose,onSave}:{contact:string;onClose:()=>void;onSave:()=>void}){const [slot,setSlot]=useState("11:30");return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={onClose}>×</button><span className="modal-icon">□</span><h2>Agendar videollamada</h2><p>Selecciona un horario para <b>{contact}</b>.</p><label>Fecha<input type="date" defaultValue="2026-07-23"/></label><label>Horarios disponibles</label><div className="slots">{["09:00","10:30","11:30","15:00","16:30"].map(s=><button className={slot===s?"active":""} onClick={()=>setSlot(s)} key={s}>{s}</button>)}</div><div className="meet"><span>▣</span><p><b>Google Meet simulado</b><small>Se generará una liga ficticia para la demo.</small></p></div><button className="primary full" onClick={onSave}>Confirmar cita</button></div></div>}
function CardTitle({title,note,action}:{title:string;note?:string;action?:string}){return <div className="card-title"><div><h3>{title}</h3>{note&&<p>{note}</p>}</div>{action&&<button>{action}</button>}</div>}
function PanelBlock({title,children}:{title:string;children:React.ReactNode}){return <div className="panel-block"><h4>{title}</h4>{children}</div>}
function Detail({label,value}:{label:string;value:string}){return <div className="detail"><span>{label}</span><b>{value}</b></div>}
function ChannelToggle({label,color}:{label:string;color:string}){const [on,setOn]=useState(true);return <div className="channel-toggle"><i className={`channel ${color}`}>{color.slice(0,2).toUpperCase()}</i><b>{label}</b><button className={`switch ${on?"on":""}`} onClick={()=>setOn(!on)}><span/></button></div>}
function subtitle(v:View){return ({Inicio:"Estado real del negocio, suscripción y operación.",Conversaciones:"Atiende cada canal desde una sola bandeja.",Contactos:"Consulta contactos y conversaciones relacionadas.","Entrenar IA":"Configura cómo debe responder el asistente.","Base de conocimiento":"Administra información útil para la IA.","Productos y servicios":"Mantén precios y servicios disponibles.","Conexiones":"Conecta o simula canales claramente identificados.",Equipo:"Administra el equipo básico.", "Plan y facturación":"Revisa trial, plan, consumo y pagos.", Configuración:"Tu organización, a tu manera.",Superadmin:"Control privado de la plataforma."} as Record<View,string>)[v]}
