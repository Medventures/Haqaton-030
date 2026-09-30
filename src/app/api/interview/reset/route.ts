import { handleResetParentData } from "@/server/pmpk-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST only: a GET reset would fire on link prefetch.
export async function POST(request: Request) { return handleResetParentData(request); }
