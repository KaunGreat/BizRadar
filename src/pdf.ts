/**
 * Скачивание PDF бизнес-плана: POST /api/v1/report/pdf -> blob -> <a download>.
 * Имя файла берём из Content-Disposition (латиница, генерирует бэкенд),
 * при его отсутствии — дефолтное.
 */
import { apiFetch } from "./auth";

export interface PdfPayload {
  niche: string;
  region: string;
  budget?: number;
}

function filenameFromResponse(res: Response): string | null {
  const cd = res.headers.get("content-disposition") || "";
  const m = cd.match(/filename="?([^";]+)"?/i);
  return m ? m[1] : null;
}

export async function downloadBusinessPlan(payload: PdfPayload): Promise<string> {
  const res = await apiFetch("/api/v1/report/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { detail?: string };
      if (j.detail) detail = j.detail;
    } catch {
      /* ответ не JSON — оставляем статус */
    }
    throw new Error(detail);
  }

  const blob = await res.blob();
  const filename = filenameFromResponse(res) || "bizradar_business_plan.pdf";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return filename;
}
