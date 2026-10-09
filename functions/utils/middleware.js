import { checkDatabaseConfig as checkDbConfig } from './databaseAdapter.js';

/**
 * Standard error handling middleware without external telemetry leakage.
 */
export async function errorHandling(context) {
  try {
    return await context.next();
  } catch (err) {
    console.error("Unhandled error in request:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal Server Error",
        message: err.message || "An unexpected error occurred"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

/**
 * Telemetry data middleware - neutralized to prevent external data leakage.
 */
export async function telemetryData(context) {
  return await context.next();
}

/**
 * Trace data helper - neutralized.
 */
export async function traceData(context, span, op, name) {
  // Telemetry disabled for privacy and anti-leakage compliance
}

/**
 * Check if the database (KV or D1) is configured.
 */
export async function checkDatabaseConfig(context) {
  const env = context.env;
  const dbConfig = checkDbConfig(env);

  if (!dbConfig.configured) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Database not configured",
        message: "Please configure KV storage (env.img_url) or D1 database (env.img_d1 / env.METADATA_D1)."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  return await context.next();
}