import pkg from "../../package.json" with { type: "json" };

/** Real package facts, read from package.json at build time. */
export const PKG = {
  name: pkg.name,
  version: pkg.version,
  license: pkg.license,
  description: pkg.description,
  node: pkg.engines.node,
} as const;

export const REPO = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
export const NPM_URL = `https://www.npmjs.com/package/${pkg.name}`;
export const CHANGELOG_URL = `${REPO}/blob/main/CHANGELOG.md`;
export const editUrl = (slug: string) => `${REPO}/edit/main/docs/${slug}.md`;

export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];
export const installCommand = (pm: PackageManager) =>
  pm === "npm" ? `npm install ${PKG.name}` : `${pm} add ${PKG.name}`;

/** M2Toolkit hosts this page at /npm-packages/chronexa; links use absolute URLs like the other package pages. */
export const M2TOOLKIT = "https://www.m2toolkit.com";
export const PACKAGES_URL = `${M2TOOLKIT}/npm-packages`;

/** Other packages in the M2Toolkit registry (titles and taglines from their own site.config.json). */
export const RELATED = [
  {
    slug: "valiq-js",
    title: "valiq-js",
    tagline: "TypeScript-first schema validation with precise, structured errors.",
    accent: "#008039",
  },
  {
    slug: "m2api-client",
    title: "API Client",
    tagline: "A Postman-style API testing workspace you can drop into any React app.",
    accent: "#2a1eff",
  },
  {
    slug: "m2diff-viewer",
    title: "Diff Viewer",
    tagline: "A code and data diff viewer for React, with an IDE-grade review experience.",
    accent: "#0b8f6a",
  },
].map((p) => ({ ...p, url: `${PACKAGES_URL}/${p.slug}` }));
