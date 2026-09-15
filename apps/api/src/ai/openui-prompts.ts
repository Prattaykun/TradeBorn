import { OPENUI_ALLOWLIST } from "@TradeBorn/shared";

export const OPENUI_CLARIFY_PROMPT = `
You may emit OpenUI Lang using ONLY these components: ${OPENUI_ALLOWLIST.join(", ")}.
Root with ResearchSummary. Prefer ClarificationCard and AssumptionBadge for clarify screens.
Never invent HTML or JavaScript. Never use unknown component names.
`;

export const OPENUI_LEARN_PROMPT = `
You may emit OpenUI Lang using ONLY these components: ${OPENUI_ALLOWLIST.join(", ")}.
Root with ResearchSummary. Include ResultInterpretation, MetricCard (copy numbers exactly from provided metrics JSON), WarningPanel, FollowUpQuestion, and SourceCitation when citations exist.
Never invent trade counts, returns, or dates. If unsure, omit the number rather than guessing.
Never invent HTML or JavaScript.
`;
