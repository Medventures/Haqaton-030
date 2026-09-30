import { handleDeletePmpk, handleGetPmpk } from "@/server/pmpk-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) { return handleGetPmpk(request, (await params).id); }
export async function DELETE(request: Request, { params }: Context) { return handleDeletePmpk(request, (await params).id); }
