import { loadAllSkills, getSkill, type Skill } from "@/data/skills";
import { getPattern } from "@/data/patterns";

// 在用户消息中查找命中的 skill：返回第一个 trigger 命中的（用户主动选定的优先）
// 简单字符串包含匹配，不上向量检索（过度工程）
export function matchSkill(userMessage: string): Skill | null {
  for (const sk of loadAllSkills()) {
    for (const t of sk.triggers) {
      if (t && userMessage.includes(t)) return sk;
    }
  }
  return null;
}

// 把 skill 配方注入到 system prompt 末尾：systemAddon + 推荐 pattern 的完整 JSON 作 few-shot
// 仅在 forceTranslationMode=false 时使用（翻译模式用户已给详细文案，不需要"创意激发"）
export function buildSkillAddon(skillOrId: Skill | string): string {
  const skill = typeof skillOrId === "string" ? getSkill(skillOrId) : skillOrId;
  if (!skill) return "";
  let out = `\n\n## 已激活能力包：${skill.name}\n${skill.description}\n\n${skill.systemAddon}\n`;
  if (skill.recommendBlocks.length) {
    out += `\n**推荐优先使用的 block 类型**：${skill.recommendBlocks.join(", ")}\n`;
  }
  if (skill.recommendUtilities.length) {
    out += `**推荐使用的 utility**：${skill.recommendUtilities.join(", ")}\n`;
  }
  if (skill.recommendTheme) {
    out += `**推荐主题（可改）**：\n\`\`\`json\n${JSON.stringify(skill.recommendTheme, null, 2)}\n\`\`\`\n`;
  }
  if (skill.fewshotPatternIds.length) {
    out += `\n### 推荐复用的 Pattern（可整 slide 写 \`patternRef:"<id>"\` 复用 layout/utilities，再用 blocks 字段覆盖文案；也可拆开混搭）：\n`;
    for (const pid of skill.fewshotPatternIds) {
      const p = getPattern(pid);
      if (!p) continue;
      out += `\n#### ${p.id} · ${p.name}（${p.description}）\n\`\`\`json\n${JSON.stringify(p.slides, null, 2)}\n\`\`\`\n`;
    }
  }
  return out;
}
