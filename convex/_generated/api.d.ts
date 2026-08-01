/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as agentRespond from "../agentRespond.js";
import type * as agents from "../agents.js";
import type * as ai from "../ai.js";
import type * as aiAgent from "../aiAgent.js";
import type * as channels from "../channels.js";
import type * as crons from "../crons.js";
import type * as directCalls from "../directCalls.js";
import type * as floor from "../floor.js";
import type * as maintenance from "../maintenance.js";
import type * as messages from "../messages.js";
import type * as presence from "../presence.js";
import type * as push from "../push.js";
import type * as pushSend from "../pushSend.js";
import type * as settings from "../settings.js";
import type * as signaling from "../signaling.js";
import type * as tasks from "../tasks.js";
import type * as transcribe from "../transcribe.js";
import type * as transmissions from "../transmissions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  agentRespond: typeof agentRespond;
  agents: typeof agents;
  ai: typeof ai;
  aiAgent: typeof aiAgent;
  channels: typeof channels;
  crons: typeof crons;
  directCalls: typeof directCalls;
  floor: typeof floor;
  maintenance: typeof maintenance;
  messages: typeof messages;
  presence: typeof presence;
  push: typeof push;
  pushSend: typeof pushSend;
  settings: typeof settings;
  signaling: typeof signaling;
  tasks: typeof tasks;
  transcribe: typeof transcribe;
  transmissions: typeof transmissions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
