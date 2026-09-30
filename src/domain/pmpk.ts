import { z } from "zod";
import type { FactId } from "./conditions";

export const PMPK_BUCKET = "pmpk-documents";
export const PMPK_MAX_BYTES = 10 * 1024 * 1024;
// Bump when the consent text shown before sending a file to OpenAI changes.
export const PMPK_CONSENT_VERSION = "pmpk-openai-2026-09";
export const PMPK_SCHEMA_VERSION = "pmpk-extraction-1";

export const PMPK_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type PmpkMime = (typeof PMPK_MIME_TYPES)[number];

export const documentTypes = [
  "PMPK_CONCLUSION", "SPECIALIST_CONCLUSION", "INDIVIDUAL_PROGRAM", "IPR",
  "REHAB_CENTER_PLAN", "MEDICAL_EXTRACT", "TEST_RESULT", "OTHER",
] as const;
export const specialistIds = ["defectolog", "logoped", "psychologist", "social_pedagogue", "other"] as const;
export const nextRoutes = ["KPPK", "OTHER"] as const;
export const supportFormats = ["individual_development_program", "other"] as const;
export const quoteFields = ["document_type", "issued_on", "consultation_on", "next_route", "specialists", "support_format", "sessions_per_week"] as const;

export const pmpkStatuses = ["pending_upload", "parsing", "needs_review", "confirmed", "failed"] as const;
export type PmpkStatus = (typeof pmpkStatuses)[number];

function isRealDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, "invalid_date");

// The fields a parent can review and correct. Free-text diagnosis is intentionally absent.
export const pmpkFieldsSchema = z.strictObject({
  document_type: z.enum(documentTypes),
  issued_on: isoDate.nullable(),
  consultation_on: isoDate.nullable(),
  issuer: z.string().trim().min(1).max(200).nullable(),
  next_route: z.enum(nextRoutes).nullable(),
  specialists: z.array(z.enum(specialistIds)).max(specialistIds.length)
    .refine((items) => new Set(items).size === items.length, "duplicate_specialist"),
  support_format: z.enum(supportFormats).nullable(),
  sessions_per_week: z.number().int().min(1).max(14).nullable(),
});
export type PmpkFields = z.infer<typeof pmpkFieldsSchema>;

export const sourceQuoteSchema = z.strictObject({
  field: z.enum(quoteFields),
  quote: z.string().trim().min(1).max(300),
});
// Dates are checked in sanitizeExtraction: a malformed date from the model becomes "not found", not an error.
export const extractionSchema = pmpkFieldsSchema.extend({
  issued_on: z.string().nullable(), consultation_on: z.string().nullable(),
  source_quotes: z.array(sourceQuoteSchema).max(12),
});
const validDate = (value: string) => isoDate.safeParse(value).success;

export type PmpkExtraction = PmpkFields & {
  source_quotes: z.infer<typeof sourceQuoteSchema>[];
  // Recommendation fields the model returned without a supporting quote; shown to the parent as "not found".
  dropped_fields: string[];
};

const nullableEnum = (values: readonly string[]) => ({ type: ["string", "null"], enum: [...values, null] });

// Hand-written for OpenAI strict mode: every property required, absence expressed as null.
export const extractionJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["document_type", "issued_on", "consultation_on", "issuer", "next_route", "specialists", "support_format", "sessions_per_week", "source_quotes"],
  properties: {
    document_type: { type: "string", enum: documentTypes },
    issued_on: { type: ["string", "null"], description: "Дата выдачи документа, YYYY-MM-DD" },
    consultation_on: { type: ["string", "null"], description: "Дата консультации или обследования, YYYY-MM-DD" },
    issuer: { type: ["string", "null"], description: "Название организации, выдавшей документ" },
    next_route: nullableEnum(nextRoutes),
    specialists: { type: "array", items: { type: "string", enum: specialistIds } },
    support_format: nullableEnum(supportFormats),
    sessions_per_week: { type: ["integer", "null"], description: "Только если частота занятий прямо указана в документе" },
    source_quotes: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["field", "quote"],
      properties: { field: { type: "string", enum: quoteFields }, quote: { type: "string" } },
    } },
  },
} as const;

// Long digit runs are IIN-like identifiers; the parent never needs them echoed back.
const identifierRun = /\d[\d\s-]{8,}\d/g;
export function maskIdentifiers(text: string) {
  return text.replace(identifierRun, (run) => (run.replace(/\D/g, "").length >= 10 ? "•••" : run));
}

export function datesProblem(fields: Pick<PmpkFields, "issued_on" | "consultation_on">, now = new Date()): string | null {
  const latest = new Date(now.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  for (const value of [fields.issued_on, fields.consultation_on]) {
    if (value && (value < "2000-01-01" || value > latest)) return "date_out_of_range";
  }
  if (fields.issued_on && fields.consultation_on && fields.consultation_on > fields.issued_on) return "consultation_after_issue";
  return null;
}

// Turns raw model output into what the parent sees. Throws only when the shape is wrong;
// implausible or unsupported values are emptied so the parent is asked to check them.
export function sanitizeExtraction(input: unknown, now = new Date()): PmpkExtraction {
  const raw = extractionSchema.parse(input);
  const quotes = raw.source_quotes.map((item) => ({ field: item.field, quote: maskIdentifiers(item.quote) }));
  const quoted = new Set<string>(quotes.map((item) => item.field));
  const fields: PmpkFields = { ...raw, issued_on: null, consultation_on: null };
  const dropped: string[] = [];
  for (const key of ["issued_on", "consultation_on"] as const) {
    const value = raw[key];
    if (value !== null && validDate(value)) fields[key] = value;
    else if (value !== null) dropped.push(key);
  }
  for (const key of ["issued_on", "consultation_on"] as const) {
    if (fields[key] && datesProblem({ issued_on: null, consultation_on: null, [key]: fields[key] }, now)) {
      fields[key] = null; dropped.push(key);
    }
  }
  if (datesProblem(fields, now)) { fields.consultation_on = null; dropped.push("consultation_on"); }
  if (fields.specialists.length && !quoted.has("specialists")) { fields.specialists = []; dropped.push("specialists"); }
  for (const key of ["next_route", "support_format", "sessions_per_week"] as const) {
    if (fields[key] !== null && !quoted.has(key)) { fields[key] = null; dropped.push(key); }
  }
  return { ...fields, source_quotes: quotes, dropped_fields: dropped };
}

export const confirmSchema = z.strictObject({
  revision: z.number().int().min(1),
  confirmed: pmpkFieldsSchema,
});

// A conclusion can only steer the route when it is a PMPK conclusion with at least one date.
export function confirmProblem(fields: PmpkFields, now = new Date()): string | null {
  if (fields.document_type !== "PMPK_CONCLUSION") return "not_pmpk_conclusion";
  if (!fields.issued_on && !fields.consultation_on) return "date_required";
  return datesProblem(fields, now);
}

export const createDocumentSchema = z.strictObject({
  mime_type: z.enum(PMPK_MIME_TYPES),
  size_bytes: z.number().int().min(1).max(PMPK_MAX_BYTES),
  consent: z.literal(true),
});

// The declared type comes from the browser; the file's own signature decides what OpenAI receives.
export function sniffMime(bytes: Uint8Array): PmpkMime | null {
  const startsWith = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  return null;
}

// What a confirmed PMPK conclusion contributes to the route. The document id and its confirmed revision
// make every correction or deletion visible as a change of route inputs.
export type ConfirmedPmpk = {
  document_id: string; revision: number;
  next_route: PmpkFields["next_route"]; specialists: PmpkFields["specialists"]; support_format: PmpkFields["support_format"];
};
export type RouteInputs = { pmpk_conclusion_confirmed: boolean; pmpk: ConfirmedPmpk | null };
export const noRouteInputs: RouteInputs = { pmpk_conclusion_confirmed: false, pmpk: null };

export function factsOf(inputs: RouteInputs): Partial<Record<FactId, boolean>> {
  return { pmpk_conclusion_confirmed: inputs.pmpk_conclusion_confirmed };
}

type DocumentRow = { id: string; status: string; confirmed_revision: number; confirmed_json: unknown };

// Must produce exactly what public.parent_facts() returns: the saved route is compared with it.
export function routeInputsFromDocument(document: DocumentRow | null): RouteInputs {
  const fields = document?.confirmed_json as Partial<PmpkFields> | null | undefined;
  if (document?.status !== "confirmed" || fields?.document_type !== "PMPK_CONCLUSION") return noRouteInputs;
  return {
    pmpk_conclusion_confirmed: true,
    pmpk: {
      document_id: document.id, revision: document.confirmed_revision,
      next_route: fields.next_route ?? null, specialists: fields.specialists ?? [], support_format: fields.support_format ?? null,
    },
  };
}

export const specialistLabels: Record<(typeof specialistIds)[number], string> = {
  defectolog: "Дефектолог", logoped: "Логопед", psychologist: "Психолог",
  social_pedagogue: "Социальный педагог", other: "Другой специалист",
};
export const documentTypeLabels: Record<(typeof documentTypes)[number], string> = {
  PMPK_CONCLUSION: "Заключение ПМПК", SPECIALIST_CONCLUSION: "Заключение специалиста", INDIVIDUAL_PROGRAM: "Индивидуальная программа",
  IPR: "ИПР", REHAB_CENTER_PLAN: "План реабилитационного центра", MEDICAL_EXTRACT: "Медицинская выписка",
  TEST_RESULT: "Результат обследования", OTHER: "Другой документ",
};
