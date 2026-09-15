import { createChatModel } from "../src/ai/llm.js";
import { env } from "../src/infrastructure/config.js";
import { embedTexts } from "../src/rag/embeddings.js";

async function main() {
  console.log("LLM_PROVIDER=", env.LLM_PROVIDER, "MODEL=", env.LLM_MODEL);
  const model = createChatModel(0);
  console.log("chat class=", model.constructor.name);

  const reply = await model.invoke("Reply with exactly: ok");
  const text =
    typeof reply.content === "string"
      ? reply.content
      : JSON.stringify(reply.content);
  console.log("chat ok:", text.slice(0, 80));

  const emb = await embedTexts(["look-ahead bias in backtesting"]);
  console.log(
    "embed ok:",
    emb?.[0]?.length ?? null,
    "dims expected",
    env.EMBEDDING_DIMENSIONS
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
