// Parses AI assistant responses for file action markers and code blocks.
//
// Supported markers (each appears on its own line directly above a fenced code block):
//   [NEW_FILE: /full/path/filename.ext]
//   [CHANGE_FILE: /full/path/filename.ext]
//
// Output: list of { kind, fullPath, name, dir, language, content } items + the
// remaining text with markers + matched blocks stripped.

export type FileBlockKind = "new" | "change";

export interface FileBlock {
  kind: FileBlockKind;
  fullPath: string; // e.g. /src/components/Foo.tsx
  name: string;     // Foo.tsx
  dir: string;      // /src/components/
  language: string; // tsx, ts, css, ...
  content: string;
}

export interface ParsedAIBlocks {
  text: string;
  blocks: FileBlock[];
}

const FENCE_RE = /```([a-zA-Z0-9_+-]+)?\n([\s\S]*?)```/g;
const MARKER_RE = /\[(NEW_FILE|CHANGE_FILE):\s*([^\]]+)\]/i;

const inferLang = (filename: string, fallback?: string) => {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    tsx: "tsx", ts: "typescript", jsx: "jsx", js: "javascript",
    css: "css", scss: "scss", html: "html", json: "json", md: "markdown",
    py: "python", go: "go", rs: "rust", java: "java", sql: "sql", sh: "bash",
  };
  return map[ext] || fallback || "plaintext";
};

const splitPath = (fullPath: string) => {
  const clean = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const lastSlash = clean.lastIndexOf("/");
  const name = clean.slice(lastSlash + 1) || "untitled.txt";
  const dir = clean.slice(0, lastSlash + 1) || "/";
  return { name, dir, fullPath: clean };
};

export function parseAIFileBlocks(input: string): ParsedAIBlocks {
  const blocks: FileBlock[] = [];
  // Match: optional marker line right before a fenced block (allow blank lines between).
  const combined = new RegExp(
    `\\[(NEW_FILE|CHANGE_FILE):\\s*([^\\]]+)\\]\\s*\\n+\\s*\`\`\`([a-zA-Z0-9_+-]+)?\\n([\\s\\S]*?)\`\`\``,
    "gi"
  );
  const replaced: Array<[number, number]> = [];

  let m: RegExpExecArray | null;
  while ((m = combined.exec(input)) !== null) {
    const kind: FileBlockKind = m[1].toUpperCase() === "NEW_FILE" ? "new" : "change";
    const rawPath = m[2].trim();
    const { name, dir, fullPath } = splitPath(rawPath);
    const lang = inferLang(name, m[3]);
    blocks.push({ kind, fullPath, name, dir, language: lang, content: m[4].trim() });
    replaced.push([m.index, m.index + m[0].length]);
  }

  // Remove matched ranges from text
  let text = input;
  for (const [s, e] of replaced.sort((a, b) => b[0] - a[0])) {
    text = text.slice(0, s) + text.slice(e);
  }
  return { text: text.trim(), blocks };
}
