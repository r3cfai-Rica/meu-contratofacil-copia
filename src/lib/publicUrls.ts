// URL pública do app — usada em links enviados a clientes (assinatura de contrato, pagamento).
// Nunca usar URLs de preview do Lovable (id-preview--*.lovable.app, *-dev.lovable.app,
// *.lovableproject.com) nesses links — essas URLs exigem login no Lovable.
//
// Configuração:
//   Servidor → defina a variável de ambiente PUBLIC_APP_URL
//   Cliente  → defina a variável de ambiente VITE_PUBLIC_APP_URL (prefixo Vite obrigatório)

const LOVABLE_FALLBACK = "https://meu-contrato-na-mao.lovable.app";

function resolvePublicAppUrl(): string {
  // 1. Servidor: process.env.PUBLIC_APP_URL (não exposto ao bundle do cliente)
  if (typeof process !== "undefined" && process.env.PUBLIC_APP_URL) {
    return process.env.PUBLIC_APP_URL;
  }
  // 2. Cliente/SSR Vite: import.meta.env.VITE_PUBLIC_APP_URL (substituído em build time)
  const viteUrl = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_PUBLIC_APP_URL;
  if (viteUrl) return viteUrl;

  // 3. Fallback — emite aviso para facilitar diagnóstico
  console.warn(
    "[publicUrls] PUBLIC_APP_URL não está configurada. Links enviados a clientes usarão o domínio " +
    "Lovable de fallback (" + LOVABLE_FALLBACK + "). " +
    "Defina PUBLIC_APP_URL (servidor) ou VITE_PUBLIC_APP_URL (Vite) nas variáveis de ambiente."
  );
  return LOVABLE_FALLBACK;
}

export const PUBLIC_APP_URL = resolvePublicAppUrl();

export type AppLang = "pt-BR" | "en-US";

function normalizeLang(lang: string | undefined | null): AppLang {
  return lang && lang.toLowerCase().startsWith("en") ? "en-US" : "pt-BR";
}

export function buildContractSignUrl(token: string, lang?: string | null): string {
  const l = normalizeLang(lang);
  return `${PUBLIC_APP_URL}/c/${token}?lang=${encodeURIComponent(l)}`;
}

export function buildInvoicePayUrl(token: string, lang?: string | null): string {
  const l = normalizeLang(lang);
  return `${PUBLIC_APP_URL}/pagar/${token}?lang=${encodeURIComponent(l)}`;
}
