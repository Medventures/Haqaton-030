// Reports configuration problems once at server start. It does not crash the server:
// the public pages must still render and explain that the service is not configured.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkConfig } = await import("@/lib/env.server");
  const { missingRequired, missingOptional } = checkConfig();
  if (missingRequired.length) {
    console.error(`[config] Required variables are missing: ${missingRequired.join(", ")}. See README → Configuration.`);
  }
  if (missingOptional.length) {
    console.warn(`[config] Optional variables are missing: ${missingOptional.join(", ")}. Related features are disabled.`);
  }
}
