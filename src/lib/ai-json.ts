export type ExpectedJsonShape = "array" | "object";

export interface GeneratedProjectFile {
  name: string;
  path: string;
  content: string;
  language: string;
  is_folder?: boolean;
}

const stripMarkdownFences = (value: string) =>
  value.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

const stripControlCharacters = (value: string) =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const repairTrailingCommas = (value: string) =>
  value.replace(/,\s*([}\]])/g, "$1");

const closeUnbalancedJson = (value: string) => {
  let repaired = value;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{" || char === "[") stack.push(char);
    if (char === "}" && stack[stack.length - 1] === "{") stack.pop();
    if (char === "]" && stack[stack.length - 1] === "[") stack.pop();
  }

  while (stack.length > 0) {
    const open = stack.pop();
    repaired += open === "{" ? "}" : "]";
  }

  return repaired;
};

const repairJsonCandidate = (value: string) =>
  closeUnbalancedJson(repairTrailingCommas(stripControlCharacters(stripMarkdownFences(value))));

const extractBalancedJson = (source: string, startIndex: number) => {
  const opening = source[startIndex];
  if (opening !== "[" && opening !== "{") return null;

  const stack: string[] = [opening];
  let inString = false;
  let escaped = false;

  for (let index = startIndex + 1; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{" || char === "[") stack.push(char);
    if (char === "}" && stack[stack.length - 1] === "{") stack.pop();
    if (char === "]" && stack[stack.length - 1] === "[") stack.pop();

    if (stack.length === 0) {
      return source.slice(startIndex, index + 1);
    }
  }

  return source.slice(startIndex);
};

const findJsonCandidate = (source: string, expected: ExpectedJsonShape) => {
  const preferred = expected === "array" ? ["[", "{"] : ["{", "["];

  for (const token of preferred) {
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] !== token) continue;
      const candidate = extractBalancedJson(source, index);
      if (candidate) return candidate;
    }
  }

  return null;
};

export const extractJsonText = (response: string, expected: ExpectedJsonShape = "array") => {
  const cleaned = stripControlCharacters(response || "").trim();
  const codeBlocks = Array.from(cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1].trim());
  const sources = [...codeBlocks, cleaned].filter(Boolean);

  for (const source of sources) {
    const candidate = findJsonCandidate(source, expected);
    if (candidate) return repairJsonCandidate(candidate);
  }

  throw new Error("AI returned text instead of valid JSON. Please try again.");
};

export const parseAiJsonResponse = <T>(response: string, expected: ExpectedJsonShape = "array"): T => {
  const parsed = JSON.parse(extractJsonText(response, expected));

  if (expected === "array") {
    if (Array.isArray(parsed)) return parsed as T;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { files?: unknown[] }).files)) {
      return (parsed as { files: unknown[] }).files as T;
    }
  }

  if (expected === "object" && Array.isArray(parsed)) {
    return { files: parsed } as T;
  }

  return parsed as T;
};

const normalizeFolderPath = (path?: string) => {
  const withSlashes = `/${(path || "/").trim().replace(/^\/+|\/+$/g, "")}/`;
  return withSlashes.replace(/\/+/g, "/").replace("//", "/");
};

export const normalizeGeneratedProjectFiles = (response: string): GeneratedProjectFile[] => {
  const parsedFiles = parseAiJsonResponse<GeneratedProjectFile[]>(response, "array");

  return parsedFiles
    .filter((item): item is GeneratedProjectFile => Boolean(item && typeof item === "object"))
    .map((item) => {
      const rawName = String(item.name || "").trim();
      const rawPath = normalizeFolderPath(item.path);
      const pathSegments = rawName.split("/").filter(Boolean);
      const derivedName = pathSegments[pathSegments.length - 1] || rawName;
      const derivedPath = pathSegments.length > 1
        ? normalizeFolderPath(`${rawPath}${pathSegments.slice(0, -1).join("/")}`)
        : rawPath;

      return {
        name: derivedName,
        path: derivedPath,
        content: typeof item.content === "string" ? item.content : "",
        language: String(item.language || "plaintext").trim() || "plaintext",
        is_folder: Boolean(item.is_folder),
      };
    })
    .filter((item) => Boolean(item.name));
};

export const collectGeneratedFolders = (files: GeneratedProjectFile[]) => {
  const folderMap = new Map<string, { name: string; path: string }>();

  for (const file of files) {
    const fullPath = normalizeFolderPath(file.path);
    const segments = fullPath.split("/").filter(Boolean);
    let currentPath = "/";

    for (const segment of segments) {
      const key = `${currentPath}${segment}/`;
      if (!folderMap.has(key)) {
        folderMap.set(key, { name: segment, path: currentPath });
      }
      currentPath = `${currentPath}${segment}/`.replace(/\/+/g, "/");
    }
  }

  return Array.from(folderMap.values());
};