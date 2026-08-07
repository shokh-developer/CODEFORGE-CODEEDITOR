import {
  SiJavascript, SiTypescript, SiReact, SiHtml5, SiCss3, SiSass, SiJson,
  SiPython, SiMarkdown, SiCplusplus, SiC, SiSharp, SiGo, SiRust, SiPhp,
  SiRuby, SiSwift, SiKotlin, SiDart, SiLua, SiGnubash, SiYaml, SiToml,
  SiDocker, SiGit, SiVite, SiTailwindcss, SiNpm, SiPostgresql, SiSvelte,
  SiVuedotjs, SiGraphql, SiOpenjdk,
} from "react-icons/si";
import { VscJson, VscFile, VscFolder, VscFolderOpened, VscSymbolFile } from "react-icons/vsc";
import { cn } from "@/lib/utils";

type IconProps = { className?: string };

/** Exact VS Code / Seti-style colour per language */
const MAP: Record<string, { Icon: React.ComponentType<IconProps>; color: string }> = {
  js: { Icon: SiJavascript, color: "text-[#f7df1e]" },
  mjs: { Icon: SiJavascript, color: "text-[#f7df1e]" },
  cjs: { Icon: SiJavascript, color: "text-[#f7df1e]" },
  jsx: { Icon: SiReact, color: "text-[#61dafb]" },
  ts: { Icon: SiTypescript, color: "text-[#3178c6]" },
  mts: { Icon: SiTypescript, color: "text-[#3178c6]" },
  cts: { Icon: SiTypescript, color: "text-[#3178c6]" },
  tsx: { Icon: SiReact, color: "text-[#61dafb]" },
  html: { Icon: SiHtml5, color: "text-[#e34f26]" },
  htm: { Icon: SiHtml5, color: "text-[#e34f26]" },
  css: { Icon: SiCss3, color: "text-[#38bdf8]" },
  scss: { Icon: SiSass, color: "text-[#cd6799]" },
  sass: { Icon: SiSass, color: "text-[#cd6799]" },
  less: { Icon: SiCss3, color: "text-[#1d365d]" },
  json: { Icon: VscJson, color: "text-[#f5c518]" },
  jsonc: { Icon: VscJson, color: "text-[#f5c518]" },
  py: { Icon: SiPython, color: "text-[#3776ab]" },
  pyw: { Icon: SiPython, color: "text-[#3776ab]" },
  md: { Icon: SiMarkdown, color: "text-[#9aa5b1]" },
  mdx: { Icon: SiMarkdown, color: "text-[#9aa5b1]" },
  markdown: { Icon: SiMarkdown, color: "text-[#9aa5b1]" },
  cpp: { Icon: SiCplusplus, color: "text-[#00599c]" },
  cc: { Icon: SiCplusplus, color: "text-[#00599c]" },
  cxx: { Icon: SiCplusplus, color: "text-[#00599c]" },
  hpp: { Icon: SiCplusplus, color: "text-[#00599c]" },
  hxx: { Icon: SiCplusplus, color: "text-[#00599c]" },
  c: { Icon: SiC, color: "text-[#5c6bc0]" },
  h: { Icon: SiC, color: "text-[#5c6bc0]" },
  cs: { Icon: SiSharp, color: "text-[#a179dc]" },
  java: { Icon: SiOpenjdk, color: "text-[#ea2d2e]" },
  jar: { Icon: SiOpenjdk, color: "text-[#ea2d2e]" },
  go: { Icon: SiGo, color: "text-[#00add8]" },
  rs: { Icon: SiRust, color: "text-[#dea584]" },
  php: { Icon: SiPhp, color: "text-[#777bb4]" },
  rb: { Icon: SiRuby, color: "text-[#cc342d]" },
  swift: { Icon: SiSwift, color: "text-[#f05138]" },
  kt: { Icon: SiKotlin, color: "text-[#a97bff]" },
  kts: { Icon: SiKotlin, color: "text-[#a97bff]" },
  dart: { Icon: SiDart, color: "text-[#00b4ab]" },
  lua: { Icon: SiLua, color: "text-[#2c2d72]" },
  sh: { Icon: SiGnubash, color: "text-[#4eaa25]" },
  bash: { Icon: SiGnubash, color: "text-[#4eaa25]" },
  zsh: { Icon: SiGnubash, color: "text-[#4eaa25]" },
  fish: { Icon: SiGnubash, color: "text-[#4eaa25]" },
  yaml: { Icon: SiYaml, color: "text-[#cb171e]" },
  yml: { Icon: SiYaml, color: "text-[#cb171e]" },
  toml: { Icon: SiToml, color: "text-[#9c4221]" },
  sql: { Icon: SiPostgresql, color: "text-[#4db6ac]" },
  svelte: { Icon: SiSvelte, color: "text-[#ff3e00]" },
  vue: { Icon: SiVuedotjs, color: "text-[#42b883]" },
  graphql: { Icon: SiGraphql, color: "text-[#e535ab]" },
  gql: { Icon: SiGraphql, color: "text-[#e535ab]" },
  xml: { Icon: VscSymbolFile, color: "text-[#f97316]" },
  svg: { Icon: VscSymbolFile, color: "text-[#ffb13b]" },
};

/** Special-case whole filenames (VS Code does this too) */
const BY_NAME: Record<string, { Icon: React.ComponentType<IconProps>; color: string }> = {
  "dockerfile": { Icon: SiDocker, color: "text-[#2496ed]" },
  "docker-compose.yml": { Icon: SiDocker, color: "text-[#2496ed]" },
  ".gitignore": { Icon: SiGit, color: "text-[#f14e32]" },
  ".gitattributes": { Icon: SiGit, color: "text-[#f14e32]" },
  "package.json": { Icon: SiNpm, color: "text-[#cb3837]" },
  "package-lock.json": { Icon: SiNpm, color: "text-[#cb3837]" },
  "vite.config.ts": { Icon: SiVite, color: "text-[#a259ff]" },
  "vite.config.js": { Icon: SiVite, color: "text-[#a259ff]" },
  "tailwind.config.ts": { Icon: SiTailwindcss, color: "text-[#38bdf8]" },
  "tailwind.config.js": { Icon: SiTailwindcss, color: "text-[#38bdf8]" },
};

export const FileIcon = ({ name, className }: { name: string; className?: string }) => {
  const lower = name.toLowerCase();
  const entry = BY_NAME[lower] ?? MAP[lower.split(".").pop() || ""];
  const Icon = entry?.Icon ?? VscFile;
  return <Icon className={cn("flex-shrink-0", entry?.color ?? "text-muted-foreground/60", className)} />;
};

/** Same visual language, but keyed by our internal `language` string */
const LANG_TO_EXT: Record<string, string> = {
  javascript: "js", typescript: "ts", jsx: "jsx", tsx: "tsx",
  html: "html", css: "css", scss: "scss", json: "json",
  python: "py", markdown: "md", cpp: "cpp", c: "c", csharp: "cs",
  java: "java", go: "go", rust: "rs", php: "php", ruby: "rb",
  swift: "swift", kotlin: "kt", dart: "dart", lua: "lua",
  bash: "sh", shell: "sh", yaml: "yaml", toml: "toml", sql: "sql",
  xml: "xml", vue: "vue", svelte: "svelte", graphql: "graphql",
};

export const LanguageIcon = ({ language, className }: { language: string; className?: string }) => (
  <FileIcon name={`x.${LANG_TO_EXT[language] ?? language}`} className={className} />
);

export const FolderIcon = ({ open, className }: { open?: boolean; className?: string }) => {
  const Icon = open ? VscFolderOpened : VscFolder;
  return <Icon className={cn("flex-shrink-0 text-[#7aa2f7]", className)} />;
};

export default FileIcon;
