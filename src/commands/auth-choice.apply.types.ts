// Shared types for applying auth-choice selections during onboarding and agent setup.
import type { OpenClawConfig } from "../config/types.openclaw.ts";
import type { RuntimeEnv } from "../runtime.ts";
import type { WizardPrompter } from "../wizard/prompts.ts";
import type { AuthChoice, OnboardOptions } from "./onboard-types.ts";

export type ApplyAuthChoiceParams = {
  authChoice: AuthChoice;
  config: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  agentDir?: string;
  setDefaultModel: boolean;
  preserveExistingDefaultModel?: boolean;
  agentId?: string;
  opts?: Partial<OnboardOptions>;
};

export type ApplyAuthChoiceResult = {
  config: OpenClawConfig;
  agentModelOverride?: string;
  retrySelection?: boolean;
};
