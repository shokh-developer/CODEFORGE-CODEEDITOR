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

// eslint-disable-next-line no-control-regex
const stripControlCharacters = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

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

// ---------------------------------------------------------------------------
// Dangling-import detection
// ---------------------------------------------------------------------------

/** Resolves a relative import specifier against the importing file's path.
 *  e.g. fromFile="/src/App.tsx", spec="./context/ThemeContext" → "/src/context/ThemeContext" */
function resolveLocalImport(fromFile: string, spec: string): string {
  const lastSlash = fromFile.lastIndexOf("/");
  const dirParts = (lastSlash >= 0 ? fromFile.slice(0, lastSlash) : "")
    .split("/")
    .filter(Boolean);

  for (const seg of spec.split("/")) {
    if (seg === ".") continue;
    if (seg === "..") dirParts.pop();
    else dirParts.push(seg);
  }
  return "/" + dirParts.join("/");
}

export interface DanglingImport {
  /** Full path of the file that has the dangling import */
  importer: string;
  /** The import specifier as written in the source */
  spec: string;
  /** Resolved absolute path (without extension) we expected to find */
  resolvedBase: string;
}

/**
 * Scans all generated JS/TS files for relative imports and returns every import
 * whose target file is NOT present in the generated set.
 */
export const findDanglingImports = (files: GeneratedProjectFile[]): DanglingImport[] => {
  // Build a lookup of every generated file path, both with and without extension
  const knownPaths = new Set<string>();
  for (const f of files) {
    if (f.is_folder) continue;
    const full = `${f.path}${f.name}`.replace(/\/+/g, "/");
    knownPaths.add(full);
    // Strip extension so extensionless imports work
    knownPaths.add(full.replace(/\.(tsx|ts|jsx|js)$/, ""));
  }

  const relImportRe = /\bfrom\s+["'](\.[^"']+?)["']|\bimport\s+["'](\.[^"']+?)["']/g;
  const dangling: DanglingImport[] = [];

  for (const f of files) {
    if (f.is_folder || !f.content) continue;
    if (!/\.(tsx?|jsx?)$/.test(f.name)) continue;

    const fromFile = `${f.path}${f.name}`.replace(/\/+/g, "/");

    for (const m of f.content.matchAll(relImportRe)) {
      const spec = (m[1] ?? m[2]).trim();
      if (!spec) continue;

      const resolvedBase = resolveLocalImport(fromFile, spec);

      const candidates = [
        resolvedBase,
        resolvedBase + ".tsx",
        resolvedBase + ".ts",
        resolvedBase + ".jsx",
        resolvedBase + ".js",
        resolvedBase + "/index.tsx",
        resolvedBase + "/index.ts",
        resolvedBase + "/index.jsx",
        resolvedBase + "/index.js",
      ];

      if (!candidates.some(c => knownPaths.has(c))) {
        // Avoid duplicate entries for the same (importer, spec)
        if (!dangling.some(d => d.importer === fromFile && d.spec === spec)) {
          dangling.push({ importer: fromFile, spec, resolvedBase });
        }
      }
    }
  }

  return dangling;
};

// ---------------------------------------------------------------------------
// Export/import mismatch auto-fixer
// ---------------------------------------------------------------------------

interface ExportProfile {
  hasDefault: boolean;
  defaultName: string | null;
  namedExports: Set<string>;
}

function buildExportProfile(content: string): ExportProfile {
  const profile: ExportProfile = { hasDefault: false, defaultName: null, namedExports: new Set() };

  if (/\bexport\s+default\b/.test(content)) {
    profile.hasDefault = true;
    let m: RegExpMatchArray | null;
    if ((m = content.match(/export\s+default\s+function\s+(\w+)/))) profile.defaultName = m[1];
    else if ((m = content.match(/export\s+default\s+class\s+(\w+)/))) profile.defaultName = m[1];
    else if ((m = content.match(/export\s+default\s+(\w+)\s*[;(]?/))) profile.defaultName = m[1];
  }

  for (const m of content.matchAll(/\bexport\s+(?:const|function|class|let|var|type|interface)\s+(\w+)/g)) {
    profile.namedExports.add(m[1]);
  }
  for (const m of content.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(",")) {
      const segments = part.trim().split(/\s+as\s+/);
      const exportedAs = (segments[1] ?? segments[0]).trim();
      const originalName = segments[0].trim();
      if (exportedAs === "default") {
        profile.hasDefault = true;
        if (!profile.defaultName) profile.defaultName = originalName;
      } else if (exportedAs) {
        profile.namedExports.add(exportedAs);
      }
    }
  }

  return profile;
}

/**
 * Detects default/named export-import mismatches across generated files and
 * auto-fixes import statements so they match the actual export style in the target file.
 *
 * Fixes two crash-causing patterns:
 *   A) import { Footer } from './Footer'  when Footer.tsx has export default Footer
 *   B) import Footer from './Footer'      when Footer.tsx only has export const Footer
 */
export const fixExportImportMismatches = (files: GeneratedProjectFile[]): GeneratedProjectFile[] => {
  // Build export profile for every JS/TS file
  const exportMap = new Map<string, ExportProfile>();

  for (const f of files) {
    if (f.is_folder || !f.content || !/\.(tsx?|jsx?)$/.test(f.name)) continue;
    const full = `${f.path}${f.name}`.replace(/\/+/g, "/");
    const profile = buildExportProfile(f.content);
    exportMap.set(full, profile);
    exportMap.set(full.replace(/\.(tsx?|jsx?)$/, ""), profile);
  }

  return files.map(f => {
    if (f.is_folder || !f.content || !/\.(tsx?|jsx?)$/.test(f.name)) return f;

    const fromFile = `${f.path}${f.name}`.replace(/\/+/g, "/");
    let content = f.content;
    let changed = false;

    const importRe = /^(import\s+)(.*?)\s+from\s+(["'])(\.[^"']+?)\3/gm;

    content = content.replace(importRe, (fullMatch, _prefix, clause, quote, spec) => {
      const trimmedClause = clause.trim();
      const resolvedBase = resolveLocalImport(fromFile, spec);
      const candidates = [
        resolvedBase, resolvedBase + ".tsx", resolvedBase + ".ts",
        resolvedBase + ".jsx", resolvedBase + ".js",
        resolvedBase + "/index.tsx", resolvedBase + "/index.ts",
      ];
      const profile = candidates.map(c => exportMap.get(c)).find(Boolean);
      if (!profile) return fullMatch;

      // Case A: import { X } from './File' but File only has export default (no named X)
      const namedMatch = trimmedClause.match(/^\{\s*(\w+)\s*\}$/);
      if (namedMatch) {
        const name = namedMatch[1];
        if (!profile.namedExports.has(name) && profile.hasDefault) {
          changed = true;
          return `import ${name} from ${quote}${spec}${quote}`;
        }
      }

      // Case B: import X from './File' but File has no default, only named export X
      if (/^\w+$/.test(trimmedClause)) {
        if (!profile.hasDefault && profile.namedExports.has(trimmedClause)) {
          changed = true;
          return `import { ${trimmedClause} } from ${quote}${spec}${quote}`;
        }
      }

      return fullMatch;
    });

    if (!changed) return f;
    return { ...f, content };
  });
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
