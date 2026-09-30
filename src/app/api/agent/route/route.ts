import { handleParentRoute } from "@/server/parent-route-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) { return handleParentRoute(request, false); }
export async function POST(request: Request) { return handleParentRoute(request, true); }
