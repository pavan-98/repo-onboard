import type { DataEdit, McpServer } from '../core/types.js';

/** Translate one MCP server definition into each tool's dialect. */

export function claudeMcp(server: McpServer): Record<string, unknown> {
  if (server.url)
    return { type: 'http', url: server.url, ...(server.headers ? { headers: server.headers } : {}) };
  return {
    command: server.command,
    ...(server.args?.length ? { args: server.args } : {}),
    ...(server.env ? { env: server.env } : {}),
  };
}

export function vscodeMcp(server: McpServer): Record<string, unknown> {
  if (server.url)
    return { type: 'http', url: server.url, ...(server.headers ? { headers: server.headers } : {}) };
  return {
    type: 'stdio',
    command: server.command,
    ...(server.args?.length ? { args: server.args } : {}),
    ...(server.env ? { env: server.env } : {}),
  };
}

export function geminiMcp(server: McpServer): Record<string, unknown> {
  if (server.url) return { httpUrl: server.url, ...(server.headers ? { headers: server.headers } : {}) };
  return {
    command: server.command,
    ...(server.args?.length ? { args: server.args } : {}),
    ...(server.env ? { env: server.env } : {}),
  };
}

export function cursorMcp(server: McpServer): Record<string, unknown> {
  if (server.url) return { url: server.url, ...(server.headers ? { headers: server.headers } : {}) };
  return claudeMcp(server);
}

export function codexMcp(server: McpServer): Record<string, unknown> {
  if (server.url) return { url: server.url, ...(server.headers ? { http_headers: server.headers } : {}) };
  return {
    command: server.command,
    ...(server.args?.length ? { args: server.args } : {}),
    ...(server.env ? { env: server.env } : {}),
  };
}

export function mcpEdits(
  servers: Record<string, McpServer>,
  key: string[],
  translate: (s: McpServer) => Record<string, unknown>,
): DataEdit[] {
  return Object.entries(servers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, server]) => ({ op: 'set' as const, path: [...key, name], value: translate(server) }));
}
