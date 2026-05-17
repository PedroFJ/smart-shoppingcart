import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const rootDir = process.cwd();
const scanRoots = ["app", "src"];
const ignoredPathParts = new Set(["node_modules", "i18n", "data"]);
const filePattern = /\.(ts|tsx)$/;
const jsxTextPattern = />\s*[A-Za-zÀ-ÿ][^<{]*</g;
const braceTextPattern = /<Text[^>]*>\s*\{\s*["'`][^"'`]+["'`]\s*\}\s*<\/Text>/g;
const warnings = [];

for (const scanRoot of scanRoots) {
  walk(join(rootDir, scanRoot));
}

if (warnings.length === 0) {
  console.log("i18n:check warning mode: no plain JSX text nodes found.");
} else {
  console.warn(`i18n:check warning mode: found ${warnings.length} possible plain JSX text node(s).`);
  warnings.forEach((warning) => {
    console.warn(`${warning.file}:${warning.line}: ${warning.text}`);
  });
}

function walk(path) {
  let pathStats;

  try {
    pathStats = statSync(path);
  } catch {
    return;
  }

  const relativePath = relative(rootDir, path);
  const pathParts = relativePath.split(/[\\/]/);

  if (pathParts.some((part) => ignoredPathParts.has(part))) {
    return;
  }

  if (pathStats.isDirectory()) {
    readdirSync(path).forEach((child) => walk(join(path, child)));
    return;
  }

  if (!filePattern.test(path)) {
    return;
  }

  checkFile(path);
}

function checkFile(path) {
  const contents = readFileSync(path, "utf8");
  const lines = contents.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.includes("<Trans") || line.includes("t(")) {
      return;
    }

    const plainTextMatches = line.match(jsxTextPattern) ?? [];
    const braceTextMatches = line.match(braceTextPattern) ?? [];

    [...plainTextMatches, ...braceTextMatches].forEach((match) => {
      warnings.push({
        file: relative(rootDir, path),
        line: index + 1,
        text: match.trim()
      });
    });
  });
}
