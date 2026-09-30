import { handleConfirmPmpk } from "@/server/pmpk-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleConfirmPmpk(request, (await params).id);
}
