const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export type ApiPage<T> = { items: T[]; total: number; page: number; pageSize: number };
export type ApiDashboard = {
  conversations: number;
  newLeads: number;
  hotLeads: number;
  appointments: number;
  aiHandled: number;
  humanHandled: number;
  byChannel: { channel: string; count: number; percentage: number }[];
  funnel: { contacts: number; contacted: number; qualified: number; hot: number; appointments: number };
  conversion: { newLeadToAppointment: number; hotToAppointment: number };
};
export type ApiContact = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName?: string | null;
  leadTemperature: "COLD" | "WARM" | "HOT";
  leadScore: number;
  lastInteractionAt?: string | null;
  tags?: { tag: { name: string; color?: string | null } }[];
};
export type ApiMessage = {
  id: string;
  content: string;
  senderType: "CONTACT" | "AI" | "USER" | "SYSTEM";
  createdAt: string;
};
export type ApiConversation = {
  id: string;
  organizationId: string;
  channel: "INSTAGRAM" | "WHATSAPP" | "FACEBOOK";
  aiStatus: "ACTIVE" | "PAUSED" | "TRANSFERRED";
  summary?: string | null;
  lastMessageAt?: string | null;
  contact: ApiContact;
  messages?: ApiMessage[];
  appointments?: unknown[];
};
export type KnowledgeKind = "faqs" | "products" | "services" | "promotions" | "schedules" | "policies";
export type KnowledgeRecord = Record<string, unknown> & { id: string; name?: string; title?: string; question?: string; code?: string; sku?: string; active?: boolean; updatedAt?: string; deletedAt?: string | null };
export type BillingInterval = "MONTHLY" | "YEARLY";
export type BillingPlan = "STARTER" | "PRO" | "ENTERPRISE";
export type PlanPrice = { id: string; plan: BillingPlan; interval: BillingInterval; currency: string; amountCents: number; monthlyContactsLimit: number; seatsLimit: number; channelsLimit: number; aiResponsesLimit: number; active: boolean; stripePriceId?: string | null };
export type SubscriptionInfo = { id: string; status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "INCOMPLETE"; trialEndsAt: string; currentPeriodEndsAt: string; trialDays: number; trialDaysLeft: number; trialExpired: boolean; planPrice: PlanPrice };
export type BillingUsage = {
  period: { startsAt: string; endsAt: string };
  limits: { contacts: number; seats: number; channels: number; aiResponses: number };
  usage: { contacts: number; seats: number; channels: number; aiResponses: number; conversations: number; messagesReceived: number; messagesSent: number };
  remaining: { contacts: number; seats: number; channels: number; aiResponses: number };
  percentages: { contacts: number; seats: number; channels: number; aiResponses: number };
  warnings: { contacts: string | null; seats: string | null; channels: string | null; aiResponses: string | null };
  conversations?: number;
  monthlyContactsLimit?: number;
  seatsLimit?: number;
  percent?: number;
};

function csrfToken() {
  if (typeof document === "undefined") return "";
  return document.cookie.split("; ").find((item) => item.startsWith("nexoia_csrf="))?.split("=")[1] ?? "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(method !== "GET" ? { "x-csrf-token": csrfToken() } : {}), ...init.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : body?.error?.message ?? "No fue posible completar la solicitud");
  return body as T;
}

export const api = {
  login: (email: string, password: string) => request<{ role: string; requiresOrganizationSelection: boolean }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password, organizationSlug: "aurea-labs-demo" }) }),
  register: (data: { name: string; email: string; password: string; businessName: string; plan: BillingPlan; interval: BillingInterval }) => request<{ role: string; requiresOrganizationSelection: boolean; trialEndsAt: string }>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  session: () => request<{ userId: string; organizationId: string; role: string }>("/auth/session"),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  dashboard: () => request<ApiDashboard>("/dashboard"),
  contacts: (page = 1) => request<ApiPage<ApiContact>>(`/contacts?page=${page}`),
  conversations: (page = 1) => request<ApiPage<ApiConversation>>(`/conversations?page=${page}`),
  conversation: (id: string) => request<ApiConversation>(`/conversations/${encodeURIComponent(id)}`),
  sendMessage: (id: string, content: string) => request<ApiMessage>(`/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ content }) }),
  saveNote: (contactId: string, content: string) => request("/notes", { method: "POST", body: JSON.stringify({ contactId, content }) }),
  savePrompt: (agentName: string, content: string, publish: boolean) => request("/prompts", { method: "POST", body: JSON.stringify({ agentName, content, publish }) }),
  automations: () => request("/automations"),
  createAppointment: (contactId: string, conversationId: string, scheduledAt: string) => request("/appointments", { method: "POST", body: JSON.stringify({ contactId, conversationId, scheduledAt }) }),
  knowledgeList: (kind: KnowledgeKind, search = "") => request<ApiPage<KnowledgeRecord>>(`/knowledge-base/${kind}?page=1&pageSize=25${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  knowledgeCreate: (kind: KnowledgeKind, data: Record<string, unknown>) => request<KnowledgeRecord>(`/knowledge-base/${kind}`, { method: "POST", body: JSON.stringify(data) }),
  knowledgeUpdate: (kind: KnowledgeKind, id: string, data: Record<string, unknown>) => request<KnowledgeRecord>(`/knowledge-base/${kind}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  knowledgeDelete: (kind: KnowledgeKind, id: string) => request<{ ok: boolean }>(`/knowledge-base/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  billingPlans: () => request<PlanPrice[]>("/billing/plans"),
  billingSubscription: () => request<SubscriptionInfo>("/billing/subscription"),
  billingUsage: () => request<BillingUsage>("/billing/usage"),
  billingCheckout: (planPriceId: string) => request<{ provider: string; status: string; checkoutUrl: string | null; message: string; planPrice: PlanPrice }>("/billing/checkout", { method: "POST", body: JSON.stringify({ planPriceId }) }),
};
