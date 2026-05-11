import { z } from "zod";

// MVP 5 种交互动作
export const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("next") }),
  z.object({ action: z.literal("prev") }),
  z.object({ action: z.literal("jumpTo"), slideId: z.string() }),
  z.object({ action: z.literal("openLink"), url: z.string().url() }),
  z.object({
    action: z.literal("setVar"),
    name: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
]);

export type DeckAction = z.infer<typeof ActionSchema>;

export const ACTION_LABELS: Record<DeckAction["action"], string> = {
  next: "下一页",
  prev: "上一页",
  jumpTo: "跳转到指定页",
  openLink: "打开外链",
  setVar: "设置变量",
};
