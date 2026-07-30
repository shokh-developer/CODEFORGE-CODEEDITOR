interface PreviewFileItem {
  name: string;
  path: string;
  content: string;
  language: string;
  is_folder: boolean;
}

const codeFilePattern = /\.(tsx|ts|jsx|js)$/i;
const previewFilePattern = /\.(html|tsx|ts|jsx|js)$/i;

const safeSerialize = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

const normalizeDirectoryPath = (path = "/") => {
  const normalized = `/${path}`.replace(/\/+/g, "/");
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
};

const normalizeFilePath = (path: string) => {
  const normalized = `/${path}`.replace(/\/+/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
};

const getFullPath = (file: PreviewFileItem) => normalizeFilePath(`${normalizeDirectoryPath(file.path)}${file.name}`);

const removeLocalScripts = (markup: string) =>
  markup.replace(/<script[^>]+src=["'](?!https?:|\/\/)([^"']+)["'][^>]*><\/script>/gi, "");

const sanitizeHtmlShell = (htmlContent: string) => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const localEntry = doc.querySelector('script[src]:not([src^="http"]):not([src^="//"])')?.getAttribute("src") || null;
    doc.querySelectorAll('script[src]:not([src^="http"]):not([src^="//"])').forEach((script) => script.remove());

    const headMarkup = removeLocalScripts(doc.head?.innerHTML || "");
    const bodyMarkup = removeLocalScripts(doc.body?.innerHTML || "");

    return {
      headMarkup,
      bodyMarkup: bodyMarkup.trim() || '<div id="root"></div>',
      localEntry,
    };
  } catch {
    return {
      headMarkup: "",
      bodyMarkup: '<div id="root"></div>',
      localEntry: null,
    };
  }
};

const collectExternalPackages = (files: PreviewFileItem[]) => {
  const packages = new Set<string>();
  const importPattern = /\b(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;

  for (const file of files) {
    if (!codeFilePattern.test(file.name)) continue;

    for (const match of file.content.matchAll(importPattern)) {
      const specifier = match[1] || match[2];
      if (!specifier) continue;
      if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("http") || specifier.startsWith("@/")) continue;
      packages.add(specifier);
    }
  }

  if (files.some((file) => /\.(tsx|jsx)$/i.test(file.name))) {
    packages.add("react");
    packages.add("react/jsx-runtime");
    packages.add("react-dom/client");
  }

  return packages;
};

const createLegacyPreviewHtml = (files: PreviewFileItem[]) => {
  const htmlFile = files.find((file) => file.name.endsWith(".html") && !file.is_folder);

  if (!htmlFile) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; display: grid; place-items: center; min-height: 100vh; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
  </style>
</head>
<body>
  <p>No previewable entry file was found.</p>
</body>
</html>`;
  }

  let htmlContent = htmlFile.content;
  const cssInject = files
    .filter((file) => file.name.endsWith(".css") && !file.is_folder)
    .map((file) => `<style>/* ${file.name} */\n${file.content}</style>`)
    .join("\n");

  const jsInject = files
    .filter((file) => (file.name.endsWith(".js") || file.name.endsWith(".ts")) && !file.is_folder && file.name !== htmlFile.name)
    .map((file) => `<script>/* ${file.name} */\n${file.content}</script>`)
    .join("\n");

  htmlContent = htmlContent.includes("</head>")
    ? htmlContent.replace("</head>", `${cssInject}\n</head>`)
    : `${cssInject}${htmlContent}`;

  htmlContent = htmlContent.includes("</body>")
    ? htmlContent.replace("</body>", `${jsInject}\n</body>`)
    : `${htmlContent}${jsInject}`;

  return htmlContent;
};

const createBundledPreviewHtml = (files: PreviewFileItem[]) => {
  const htmlFile = files.find((file) => file.name.endsWith(".html") && !file.is_folder);
  const fileMap = Object.fromEntries(files.filter((file) => !file.is_folder).map((file) => [getFullPath(file), file.content]));
  const { headMarkup, bodyMarkup, localEntry } = htmlFile
    ? sanitizeHtmlShell(htmlFile.content)
    : { headMarkup: "", bodyMarkup: '<div id="root"></div>', localEntry: null };

  const inferredEntry = localEntry
    || ["/src/main.tsx", "/src/main.jsx", "/main.tsx", "/main.jsx", "/src/App.tsx", "/src/App.jsx"]
      .find((candidate) => fileMap[candidate])
    || Object.keys(fileMap).find((path) => codeFilePattern.test(path));

  if (!inferredEntry) {
    return createLegacyPreviewHtml(files);
  }

  const REACT_VERSION = "18.3.1";
  const cdnUrl = (pkg: string) => {
    if (pkg === "react") return `https://esm.sh/react@${REACT_VERSION}`;
    if (pkg === "react/jsx-runtime") return `https://esm.sh/react@${REACT_VERSION}/jsx-runtime`;
    if (pkg === "react/jsx-dev-runtime") return `https://esm.sh/react@${REACT_VERSION}/jsx-dev-runtime`;
    if (pkg === "react-dom") return `https://esm.sh/react-dom@${REACT_VERSION}?external=react`;
    if (pkg.startsWith("react-dom/")) return `https://esm.sh/react-dom@${REACT_VERSION}/${pkg.slice("react-dom/".length)}?external=react`;
    return `https://esm.sh/${pkg}?external=react,react-dom`;
  };

  const importMap = {
    imports: Object.fromEntries(Array.from(collectExternalPackages(files)).sort().map((pkg) => [pkg, cdnUrl(pkg)])),
  };

  const needsTailwind = files.some((file) =>
    (/\.css$/i.test(file.name) && /@tailwind|@apply/.test(file.content))
    || /tailwind\.config\./i.test(file.name));


  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${headMarkup}
  ${needsTailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : ""}
  <style>
    body { margin: 0; }
    #__preview_error__ { display: none; padding: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; color: #fecaca; background: #450a0a; border-radius: 6px; margin: 8px; }
    #__preview_loading__ { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0f172a; color: #94a3b8; font-family: system-ui, sans-serif; font-size: 13px; gap: 12px; z-index: 9999; }
    #__preview_loading__ svg { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
  <script async src="https://ga.jspm.io/npm:es-module-shims@1.10.0/dist/es-module-shims.js"></script>
  <script type="importmap">${safeSerialize(importMap)}</script>
</head>
<body>
  <div id="__preview_loading__">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
    <span>Building preview…</span>
  </div>
  ${bodyMarkup}
  <pre id="__preview_error__"></pre>
  <script type="module">
    const files = ${safeSerialize(fileMap)};
    const entryPath = ${safeSerialize(inferredEntry)};
    const errorNode = document.getElementById("__preview_error__");
    const loadingNode = document.getElementById("__preview_loading__");

    const normalizePath = (value) => {
      const normalized = ("/" + value).replace(/\\/+/g, "/");
      return normalized.startsWith("/") ? normalized : "/" + normalized;
    };

    const dirname = (value) => value.slice(0, value.lastIndexOf("/") + 1);

    const withCandidates = (base) => {
      const normalized = normalizePath(base);
      return [
        normalized,
        normalized + ".tsx",
        normalized + ".ts",
        normalized + ".jsx",
        normalized + ".js",
        normalized + ".json",
        normalized + ".css",
        normalized + "/index.tsx",
        normalized + "/index.ts",
        normalized + "/index.jsx",
        normalized + "/index.js",
      ];
    };

    const resolveLocalPath = (specifier, importer) => {
      if (specifier.startsWith("@/")) {
        return withCandidates("/src/" + specifier.slice(2)).find((candidate) => files[candidate]) || normalizePath("/src/" + specifier.slice(2));
      }

      if (specifier.startsWith("/")) {
        return withCandidates(specifier).find((candidate) => files[candidate]) || normalizePath(specifier);
      }

      const base = normalizePath(dirname(importer || entryPath) + specifier);
      return withCandidates(base).find((candidate) => files[candidate]) || base;
    };

    const detectLoader = (path) => {
      if (path.endsWith(".tsx")) return "tsx";
      if (path.endsWith(".ts")) return "ts";
      if (path.endsWith(".jsx")) return "jsx";
      if (path.endsWith(".js")) return "js";
      if (path.endsWith(".json")) return "json";
      return "js";
    };

    const showError = (error) => {
      if (loadingNode) loadingNode.style.display = "none";
      errorNode.style.display = "block";
      errorNode.textContent = error instanceof Error ? (error.message + "\n\n" + (error.stack || "")) : String(error);
      console.error(error);
    };

    try {
      const esbuild = await import("https://unpkg.com/esbuild-wasm@0.25.3/esm/browser.min.js");
      await esbuild.initialize({ wasmURL: "https://unpkg.com/esbuild-wasm@0.25.3/esbuild.wasm" });

      const virtualFilesPlugin = {
        name: "virtual-files",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.path === "__entry__") {
              return { path: entryPath, namespace: "virtual" };
            }

            if (args.path.startsWith(".") || args.path.startsWith("/") || args.path.startsWith("@/")) {
              return { path: resolveLocalPath(args.path, args.importer), namespace: "virtual" };
            }

            return { path: args.path, external: true };
          });

          build.onLoad({ filter: /.*/, namespace: "virtual" }, (args) => {
            const source = files[args.path];

            if (typeof source !== "string") {
              return {
                contents: "throw new Error(" + JSON.stringify("Missing file in preview: " + args.path) + ");",
                loader: "js",
              };
            }

            if (args.path.endsWith(".css")) {
              return {
                contents: "const style = document.createElement('style'); style.textContent = " + JSON.stringify(source) + "; document.head.appendChild(style); export default {};",
                loader: "js",
              };
            }

            return {
              contents: source,
              loader: detectLoader(args.path),
            };
          });
        },
      };

      const result = await esbuild.build({
        entryPoints: ["__entry__"],
        bundle: true,
        write: false,
        format: "esm",
        platform: "browser",
        jsx: "automatic",
        target: ["es2020"],
        plugins: [virtualFilesPlugin],
      });

      const bundledFile = result.outputFiles.find((file) => file.path.endsWith(".js"));
      if (!bundledFile) throw new Error("Preview bundle was not generated.");

      const bundledUrl = URL.createObjectURL(new Blob([bundledFile.text], { type: "text/javascript" }));
      if (loadingNode) loadingNode.style.display = "none";
      await import(bundledUrl);
    } catch (error) {
      showError(error);
    }
  </script>
</body>
</html>`;
};

export const buildPreviewHtml = (files: PreviewFileItem[]) => {
  const previewableFiles = files.filter((file) => !file.is_folder && previewFilePattern.test(file.name));
  const htmlFile = previewableFiles.find((file) => file.name.endsWith(".html"));
  const hasModernProject = previewableFiles.some((file) => codeFilePattern.test(file.name))
    || Boolean(htmlFile && /type=["']module["']|src=["']\/?src\//i.test(htmlFile.content));

  return hasModernProject ? createBundledPreviewHtml(previewableFiles) : createLegacyPreviewHtml(previewableFiles);
};