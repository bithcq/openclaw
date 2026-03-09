/**
 * 文件功能：企业微信回复文本清洗，默认移除来源链接，保留纯文本结论。
 * 主要类/函数：
 * - shouldKeepLinksByUserIntent：判断用户是否明确要求保留链接/来源。
 * - sanitizeWecomReplyText：在默认模式下移除 URL 与 markdown 链接。
 * 关键依赖或环境变量：无。
 */

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/giu;
const URL_RE = /https?:\/\/[^\s<>\])）】]+/giu;

const KEEP_LINK_KEYWORDS = [
  "链接",
  "来源",
  "网址",
  "url",
  "source",
  "reference",
  "参考资料",
  "原文",
  "出处",
];

const DEFAULT_WECOM_TEXT_MAX_CHARS = 500;

export function shouldKeepLinksByUserIntent(userText: string): boolean {
  const normalized = (userText ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return KEEP_LINK_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function sanitizeWecomReplyText(text: string, keepLinks: boolean): string {
  const raw = (text ?? "").trim();
  if (!raw) {
    return "";
  }
  if (keepLinks) {
    return raw;
  }

  // 先把 markdown 链接降级成普通文字，再移除裸 URL。
  let cleaned = raw.replace(MARKDOWN_LINK_RE, "$1");
  cleaned = cleaned.replace(URL_RE, "");
  cleaned = cleaned.replace(/[ \t]+\n/gu, "\n");
  cleaned = cleaned.replace(/\n{3,}/gu, "\n\n");
  cleaned = cleaned.trim();
  return cleaned;
}

export function splitWecomTextByChars(
  text: string,
  maxChars = DEFAULT_WECOM_TEXT_MAX_CHARS,
): string[] {
  const raw = (text ?? "").trim();
  if (!raw) {
    return [];
  }
  const safeMaxChars = Math.max(1, Math.floor(maxChars));
  const parts: string[] = [];
  let current = "";
  let currentChars = 0;

  // 按 Unicode 字符计数分片，确保每片不超过 maxChars。
  for (const char of raw) {
    current += char;
    currentChars += 1;
    if (currentChars >= safeMaxChars) {
      parts.push(current);
      current = "";
      currentChars = 0;
    }
  }

  if (current) {
    parts.push(current);
  }
  return parts;
}
