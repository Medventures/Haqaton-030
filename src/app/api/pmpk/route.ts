import { handleCreatePmpk, handleGetPmpk } from "@/server/pmpk-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) { return handleGetPmpk(request, null); }
export async function POST(request: Request) { return handleCreatePmpk(request); }
