import { handleParsePmpk } from "@/server/pmpk-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Recognition runs inside this request: up to 90 s for the model plus reading the file.
export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleParsePmpk(request, (await params).id);
}
