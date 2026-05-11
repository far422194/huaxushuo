import { zodToJsonSchema } from "zod-to-json-schema";
import { DeckSchema } from "@shared/dsl";
import type { ToolDefinition } from "./types";

const deckJsonSchema = zodToJsonSchema(DeckSchema, {
  $refStrategy: "none",
  target: "jsonSchema7",
});
delete (deckJsonSchema as any).$schema;

const jsonPatchOpSchema = {
  type: "object",
  properties: {
    op: {
      type: "string",
      enum: ["add", "remove", "replace", "move", "copy", "test"],
      description: "操作类型",
    },
    path: {
      type: "string",
      description: "JSON Pointer，如 /slides/0/blocks/2/text",
    },
    value: { description: "add/replace/test 时使用" },
    from: { type: "string", description: "move/copy 时使用" },
  },
  required: ["op", "path"],
};

export const TOOLS: ToolDefinition[] = [
  {
    name: "create_deck",
    description:
      "从零生成一份完整的演示 deck。当用户首次提需求、说重做/换一个/从头开始时使用。",
    parameters: {
      type: "object",
      properties: { deck: deckJsonSchema as any },
      required: ["deck"],
    },
  },
  {
    name: "patch_deck",
    description:
      "对当前 deck 应用 RFC 6902 JSON Patch 数组（增量编辑）。用户在已有 deck 基础上要求局部修改时使用。",
    parameters: {
      type: "object",
      properties: {
        patches: {
          type: "array",
          items: jsonPatchOpSchema,
          description: "RFC 6902 patch 数组，按顺序应用",
        },
        summary: {
          type: "string",
          description: "一句话说明本次改动，用于在对话中展示",
        },
      },
      required: ["patches", "summary"],
    },
  },
];

export type ToolName = "create_deck" | "patch_deck";
