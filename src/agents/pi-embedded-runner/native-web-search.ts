/**
 * 文件功能：在 baseUrl 模式下切换为模型原生 web_search，并禁用本地 web_search 工具定义。
 * 主要导出：
 * - shouldUseNativeWebSearchForBaseUrl：判断是否启用原生 web_search。
 * - filterLocalWebSearchTools：从工具列表中移除本地 web_search。
 * - wrapStreamFnWithNativeWebSearch：在请求 payload 注入 { type: "web_search" }。
 * 关键依赖：@mariozechner/pi-ai 的 streamSimple、tool-policy 里的 normalizeToolName。
 */
import type { StreamFn } from "@mariozechner/pi-agent-core";
import { streamSimple } from "@mariozechner/pi-ai";
import { normalizeToolName } from "../tool-policy.js";

type NamedTool = { name?: string };

const HOSTED_WEB_SEARCH_TOOL = { type: "web_search" } as const;

function canonicalToolName(name: string): string {
  const normalized = normalizeToolName(name);
  return normalized.startsWith("$") ? normalized.slice(1) : normalized;
}

function isWebSearchName(name: string): boolean {
  return canonicalToolName(name) === "web_search";
}

function isLocalWebSearchTool(tool: unknown): boolean {
  if (!tool || typeof tool !== "object") {
    return false;
  }
  const name = (tool as { name?: unknown }).name;
  return typeof name === "string" && isWebSearchName(name);
}

function resolveHostedToolType(tool: unknown): string | undefined {
  if (!tool || typeof tool !== "object") {
    return undefined;
  }
  const type = (tool as { type?: unknown }).type;
  if (typeof type !== "string") {
    return undefined;
  }
  const normalized = type.trim().toLowerCase();
  return normalized || undefined;
}

function isHostedWebSearchToolDefinition(tool: unknown): boolean {
  return resolveHostedToolType(tool) === "web_search";
}

function isHostedWebSearchPreviewToolDefinition(tool: unknown): boolean {
  return resolveHostedToolType(tool) === "web_search_preview";
}

function isFunctionWebSearchToolDefinition(tool: unknown): boolean {
  if (!tool || typeof tool !== "object") {
    return false;
  }
  const type = (tool as { type?: unknown }).type;
  if (type !== "function") {
    return false;
  }
  const fn = (tool as { function?: unknown }).function;
  if (!fn || typeof fn !== "object") {
    return false;
  }
  const name = (fn as { name?: unknown }).name;
  return typeof name === "string" && isWebSearchName(name);
}

function normalizeToolChoiceForNativeWebSearch(payload: Record<string, unknown>): void {
  const toolChoice = payload.tool_choice;
  if (!toolChoice || typeof toolChoice !== "object") {
    return;
  }
  const toolChoiceRecord = toolChoice as Record<string, unknown>;
  const type = toolChoiceRecord.type;
  if (typeof type !== "string" || type.trim().toLowerCase() !== "function") {
    return;
  }
  const fn = toolChoiceRecord.function;
  if (!fn || typeof fn !== "object") {
    return;
  }
  const name = (fn as { name?: unknown }).name;
  if (typeof name === "string" && isWebSearchName(name)) {
    payload.tool_choice = "auto";
  }
}

function rewritePayloadWithNativeWebSearch(payload: unknown): void {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const payloadRecord = payload as Record<string, unknown>;
  const rawTools = Array.isArray(payloadRecord.tools) ? payloadRecord.tools : [];
  const nextTools = rawTools.filter(
    (tool) =>
      !isFunctionWebSearchToolDefinition(tool) && !isHostedWebSearchPreviewToolDefinition(tool),
  );
  if (!nextTools.some((tool) => isHostedWebSearchToolDefinition(tool))) {
    nextTools.push({ ...HOSTED_WEB_SEARCH_TOOL });
  }
  payloadRecord.tools = nextTools;
  normalizeToolChoiceForNativeWebSearch(payloadRecord);
}

export function shouldUseNativeWebSearchForBaseUrl(params: {
  model: { baseUrl?: string } | undefined;
  tools: NamedTool[];
}): boolean {
  const baseUrl = params.model?.baseUrl?.trim();
  if (!baseUrl) {
    return false;
  }
  return params.tools.some((tool) => isLocalWebSearchTool(tool));
}

export function filterLocalWebSearchTools<T extends NamedTool>(tools: T[]): T[] {
  return tools.filter((tool) => !isLocalWebSearchTool(tool));
}

export function wrapStreamFnWithNativeWebSearch(baseFn: StreamFn | undefined): StreamFn {
  const streamFn = baseFn ?? streamSimple;
  return (model, context, options) =>
    streamFn(model, context, {
      ...options,
      // onPayload 签名：(payload, model) => unknown
      onPayload: (payload: unknown, mdl: unknown) => {
        rewritePayloadWithNativeWebSearch(payload);
        return options?.onPayload?.(payload, mdl as never);
      },
    });
}
