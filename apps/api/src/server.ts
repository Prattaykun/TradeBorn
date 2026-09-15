import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./infrastructure/config.js";
import { registerRoutes } from "./app.js";

async function main() {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
  });
  await registerRoutes(app);

  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  console.log(
    `TradeBorn API on http://${env.API_HOST}:${env.API_PORT} (llm=${env.LLM_PROVIDER}/${env.LLM_MODEL})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
