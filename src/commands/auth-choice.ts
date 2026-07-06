// Public auth-choice barrel used by onboarding and agent setup commands.
export { applyAuthChoice } from "./auth-choice.apply.ts";
export { warnIfModelConfigLooksOff } from "./auth-choice.model-check.ts";
export { resolvePreferredProviderForAuthChoice } from "../plugins/provider-auth-choice-preference.ts";
