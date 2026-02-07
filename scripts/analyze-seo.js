#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parse } = require("node-html-parser");
const { DOMParser } = require("xmldom");

const projectRoot = process.cwd();
const viewRoot = path.join(projectRoot, "resources/views");
const publicRoot = path.join(projectRoot, "public");
const configRoot = path.join(projectRoot, "config");
const routesRoot = path.join(projectRoot, "routes");

const DYNAMIC = "__DYNAMIC__";

const args = process.argv.slice(2);
const fixMode = args.includes("--fix");
const useHttp = args.includes("--http");
const appUrlArg = getArgValue("--app-url");

const issues = [];
const files = [];
const analysisCache = new Map();

const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he", "in", "is", "it", "its", "of", "on", "that", "the", "to", "was", "were", "will", "with", "you", "your", "we", "our", "they", "their", "or", "but", "not",
]);

const genericAlt = new Set(["image", "photo", "picture", "placeholder", "img", "logo", "icon"]);

function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] || null;
}

function addIssue(target, issue) {
  target.issues.push(issue);
}

function stripBlade(raw) {
  return raw
    .replace(/@(?:if|elseif|else|endif|foreach|endforeach|for|endfor|while|endwhile|switch|case|break|default|endswitch|extends|section|endsection|yield|include|includeIf|includeWhen|includeUnless|stack|push|endpush|prepend|endprepend|csrf|method|vite|once|endonce|production|endproduction|verbatim|endverbatim|php|endphp|auth|endauth|guest|endguest|props|pushonce|endpushonce)\b[^\n]*/gi, "")
    .replace(/\{\{[\s\S]*?\}\}/g, DYNAMIC)
    .replace(/\{!![\s\S]*?!!\}/g, DYNAMIC);
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => token && !stopWords.has(token));
}

function textContent(node) {
  return node.text.replace(/\s+/g, " ").trim();
}

function countWords(text) {
  return text ? text.trim().split(/\s+/).length : 0;
}

function textToHtmlRatio(text, html) {
  if (!html.length) return 0;
  return text.length / html.length;
}

function readFileSafe(fp) {
  try {
    return fs.readFileSync(fp, "utf8");
  } catch {
    return null;
  }
}

function writeFileSafe(fp, contents) {
  fs.writeFileSync(fp, contents, "utf8");
}

function lineNumberAt(text, index) {
  if (index < 0) return null;
  return text.slice(0, index).split("\n").length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePath(input) {
  if (!input) return null;
  const stripped = input.split("#")[0].split("?")[0];
  if (!stripped) return null;
  if (stripped === "/") return "/";
  return stripped.replace(/\/$/, "");
}

function guessPath(filePath) {
  const relative = path.relative(viewRoot, filePath).replace(/\\/g, "/");
  const noExt = relative.replace(/\.blade\.php$/, "");
  if (noExt === "index") return "/";
  if (noExt.endsWith("/index")) return `/${noExt.replace(/\/index$/, "")}`;
  return `/${noExt}`;
}

function readAppUrl() {
  if (appUrlArg) {
    return appUrlArg.replace(/\/$/, "");
  }
  const configPath = path.join(configRoot, "app.php");
  const raw = readFileSafe(configPath);
  if (!raw) {
    return null;
  }
  const match = raw.match(/['"]url['"]\s*=>\s*env\(['"]APP_URL['"],\s*['"]([^'"]+)['"]\)/i);
  if (!match) {
    return null;
  }
  return match[1].replace(/\/$/, "");
}

function extractStaticRoutes() {
  const routesPath = path.join(routesRoot, "web.php");
  const raw = readFileSafe(routesPath);
  if (!raw) return [];
  const results = new Set();
  const regex = /Route::(?:get|view|match|any)\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const route = match[1];
    if (!route.includes("{") && !route.includes("}")) {
      results.add(route.startsWith("/") ? route : `/${route}`);
    }
  }
  results.add("/");
  return Array.from(results);
}

function isInternalHref(href) {
  return href && href.startsWith("/") && !href.startsWith("//");
}

function validateSchemaObject(obj, fileReport) {
  if (!obj || typeof obj !== "object") return;

  const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]].filter(Boolean);
  if (types.length === 0) return;

  const requiredByType = {
    Organization: ["name", "url"],
    WebSite: ["name", "url"],
    WebPage: ["name", "description"],
    Article: ["headline", "datePublished", "author", "image"],
    BlogPosting: ["headline", "datePublished", "author", "image"],
    Product: ["name", "image", "offers"],
    BreadcrumbList: ["itemListElement"],
  };

  types.forEach((type) => {
    const required = requiredByType[type];
    if (!required) return;
    required.forEach((key) => {
      if (!obj[key]) {
        addIssue(fileReport, {
          type: "json_ld_missing_field",
          severity: "warning",
          message: `JSON-LD ${type} missing ${key}.`,
          details: { type, key },
          line: null,
        });
      }
    });

    if (type === "Product") {
      const offers = obj.offers;
      const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];
      const hasCompleteOffer = offerList.some((offer) => offer && offer.price && offer.priceCurrency && offer.availability);
      if (!hasCompleteOffer) {
        addIssue(fileReport, {
          type: "json_ld_product_offers",
          severity: "warning",
          message: "JSON-LD Product offers missing price/priceCurrency/availability.",
          details: {},
          line: null,
        });
      }
    }

    if (type === "BreadcrumbList") {
      const elements = obj.itemListElement;
      const list = Array.isArray(elements) ? elements : [];
      const valid = list.every((entry) => entry && entry.position && entry.name && entry.item);
      if (!valid) {
        addIssue(fileReport, {
          type: "json_ld_breadcrumbs",
          severity: "warning",
          message: "BreadcrumbList items should include position, name, and item.",
          details: {},
          line: null,
        });
      }
    }
  });
}

function scanHtml(html, fileReport, appUrl) {
  const root = parse(html, { lowerCaseTagName: false });
  const head = root.querySelector("head");
  const body = root.querySelector("body");

  const h1s = root.querySelectorAll("h1");
  fileReport.stats.h1_count = h1s.length;
  if (h1s.length === 0) {
    addIssue(fileReport, { type: "missing_h1", severity: "error", message: "No <h1> found.", details: {}, line: null });
  }
  if (h1s.length > 1) {
    addIssue(fileReport, { type: "multiple_h1", severity: "warning", message: "More than one <h1> found.", details: {}, line: null });
  }

  const headings = root.querySelectorAll("h1,h2,h3,h4,h5,h6");
  if (headings.length > 0) {
    const firstLevel = Number(headings[0].tagName.slice(1));
    if (firstLevel > 1) {
      addIssue(fileReport, { type: "heading_starts_not_h1", severity: "error", message: "First heading is not H1.", details: {}, line: null });
    }
    for (let i = 1; i < headings.length; i += 1) {
      const prev = Number(headings[i - 1].tagName.slice(1));
      const current = Number(headings[i].tagName.slice(1));
      if (current - prev > 1) {
        addIssue(fileReport, { type: "heading_jump", severity: "warning", message: "Heading level jumps more than one.", details: { from: prev, to: current }, line: null });
      }
    }
  }

  const title = head?.querySelector("title");
  const titleText = title ? textContent(title) : "";
  if (!titleText) {
    addIssue(fileReport, { type: "missing_title", severity: "error", message: "Missing or empty <title>.", details: {}, line: null });
  }

  const metaDesc = head?.querySelector('meta[name="description"]');
  const metaDescContent = metaDesc?.getAttribute("content")?.trim() || "";
  if (!metaDescContent) {
    addIssue(fileReport, { type: "missing_meta_description", severity: "error", message: "Missing meta description.", details: {}, line: null });
  } else if (metaDescContent.length < 120 || metaDescContent.length > 160) {
    addIssue(fileReport, { type: "meta_description_length", severity: "suggestion", message: "Meta description length is outside 120-160 characters.", details: { length: metaDescContent.length }, line: null });
  }

  const robotsMeta = head?.querySelector('meta[name="robots"]');
  const robotsContent = robotsMeta?.getAttribute("content")?.toLowerCase() || "";
  if (robotsContent.includes("noindex") || robotsContent.includes("nofollow")) {
    addIssue(fileReport, { type: "meta_robots_noindex", severity: "warning", message: "meta robots includes noindex/nofollow.", details: {}, line: null });
  }

  const canonicalTags = head?.querySelectorAll('link[rel="canonical"]') || [];
  if (canonicalTags.length > 1) {
    addIssue(fileReport, { type: "multiple_canonical", severity: "error", message: "Multiple canonical tags found.", details: {}, line: null });
  }

  const canonical = canonicalTags[0];
  const canonicalHref = canonical?.getAttribute("href")?.trim() || "";
  if (!canonicalHref) {
    addIssue(fileReport, { type: "missing_canonical", severity: "error", message: "Missing canonical link.", details: {}, line: null });
  } else {
    if (!/^https?:\/\//i.test(canonicalHref)) {
      addIssue(fileReport, { type: "canonical_not_absolute", severity: "error", message: "Canonical href should be absolute.", details: {}, line: null });
    }
    if (canonicalHref.startsWith("http://")) {
      addIssue(fileReport, { type: "canonical_http", severity: "warning", message: "Canonical uses http://.", details: {}, line: null });
    }
    if (canonicalHref.includes("?")) {
      addIssue(fileReport, { type: "canonical_has_query", severity: "suggestion", message: "Canonical includes query parameters.", details: {}, line: null });
    }
    if (appUrl && !canonicalHref.startsWith(appUrl)) {
      addIssue(fileReport, { type: "canonical_base_mismatch", severity: "warning", message: "Canonical does not match app URL base.", details: { appUrl }, line: null });
    }
  }

  const ogRequired = ["og:title", "og:description", "og:url", "og:type", "og:image"];
  for (const property of ogRequired) {
    const tag = head?.querySelector(`meta[property="${property}"]`);
    const value = tag?.getAttribute("content")?.trim() || "";
    if (property === "og:type") {
      if (!tag) {
        addIssue(fileReport, { type: "missing_og", severity: "warning", message: "Missing OpenGraph og:type.", details: { property }, line: null });
      } else if (!value) {
        addIssue(fileReport, { type: "missing_og", severity: "error", message: "OpenGraph og:type is empty.", details: { property }, line: null });
      }
      continue;
    }
    if (!value) {
      addIssue(fileReport, { type: "missing_og", severity: "error", message: `Missing OpenGraph ${property}.`, details: { property }, line: null });
    }
  }

  const ogLocale = head?.querySelector('meta[property="og:locale"]')?.getAttribute("content")?.trim() || "";
  if (!ogLocale) {
    addIssue(fileReport, { type: "missing_og_locale", severity: "suggestion", message: "Missing og:locale.", details: {}, line: null });
  }

  const ogSite = head?.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim() || "";
  if (!ogSite) {
    addIssue(fileReport, { type: "missing_og_site_name", severity: "suggestion", message: "Missing og:site_name.", details: {}, line: null });
  }

  const twitterRequired = ["twitter:card", "twitter:title", "twitter:description", "twitter:image"];
  for (const name of twitterRequired) {
    const tag = head?.querySelector(`meta[name="${name}"]`);
    const value = tag?.getAttribute("content")?.trim() || "";
    if (!value) {
      addIssue(fileReport, { type: "missing_twitter", severity: "warning", message: `Missing Twitter ${name}.`, details: { name }, line: null });
    }
  }

  const twitterSite = head?.querySelector('meta[name="twitter:site"]')?.getAttribute("content")?.trim() || "";
  if (!twitterSite) {
    addIssue(fileReport, { type: "missing_twitter_site", severity: "suggestion", message: "Missing twitter:site.", details: {}, line: null });
  }

  root.querySelectorAll("img").forEach((img) => {
    const alt = img.getAttribute("alt");
    if (!alt || !alt.trim()) {
      addIssue(fileReport, { type: "img_missing_alt", severity: "error", message: "Image missing alt.", details: {}, line: null });
    } else if (genericAlt.has(alt.trim().toLowerCase())) {
      addIssue(fileReport, { type: "img_generic_alt", severity: "suggestion", message: "Image alt text is too generic.", details: { alt }, line: null });
    }

    const width = img.getAttribute("width");
    const height = img.getAttribute("height");
    if ((!width || !height) && !(img.getAttribute("src") || "").endsWith(".svg")) {
      addIssue(fileReport, { type: "img_missing_dimensions", severity: "suggestion", message: "Image missing width/height.", details: {}, line: null });
    }

    const loading = img.getAttribute("loading");
    if (!loading) {
      addIssue(fileReport, { type: "img_missing_lazy", severity: "suggestion", message: "Image missing loading=\"lazy\".", details: {}, line: null });
    }
  });

  const internalLinks = [];

  root.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href")?.trim() || "";
    const rawText = textContent(anchor);
    const hasDynamic = rawText.includes(DYNAMIC);
    const text = rawText.replace(DYNAMIC, "").trim();
    if (!text && !hasDynamic) {
      addIssue(fileReport, { type: "empty_anchor", severity: "error", message: "Anchor has no text.", details: {}, line: null });
    }
    if (!href || href === "#" || href.toLowerCase() === "javascript:void(0)") {
      addIssue(fileReport, { type: "empty_href", severity: "warning", message: "Anchor href is empty or non-navigable.", details: {}, line: null });
    }
    if (text && ["click here", "read more", "learn more"].includes(text.toLowerCase())) {
      addIssue(fileReport, { type: "generic_anchor_text", severity: "suggestion", message: "Anchor text is generic.", details: { text }, line: null });
    }

    if (isInternalHref(href)) {
      internalLinks.push(normalizePath(href));
      if (/[A-Z_]/.test(href)) {
        addIssue(fileReport, { type: "non_seo_slug", severity: "suggestion", message: "Internal URL contains uppercase letters or underscores.", details: { href }, line: null });
      }
    }
  });

  const bodyText = body ? textContent(body) : textContent(root);
  const normalizedBody = bodyText.replace(DYNAMIC, "word");
  const wordCount = countWords(normalizedBody);
  const ratio = textToHtmlRatio(normalizedBody, html);
  fileReport.stats.word_count = wordCount;
  fileReport.stats.text_html_ratio = Number(ratio.toFixed(3));
  if (wordCount < 300 || ratio < 0.15) {
    addIssue(fileReport, { type: "thin_content", severity: "warning", message: "Thin content detected.", details: { wordCount, ratio: fileReport.stats.text_html_ratio }, line: null });
  }

  const jsonLd = root.querySelectorAll('script[type="application/ld+json"]');
  if (wordCount >= 600 && jsonLd.length === 0) {
    addIssue(fileReport, { type: "missing_json_ld", severity: "suggestion", message: "Consider adding JSON-LD for rich results.", details: {}, line: null });
  }
  jsonLd.forEach((tag) => {
    const content = textContent(tag);
    try {
      const parsed = JSON.parse(content);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      entries.forEach((entry) => validateSchemaObject(entry, fileReport));
    } catch {
      addIssue(fileReport, { type: "invalid_json_ld", severity: "error", message: "JSON-LD is not valid JSON.", details: {}, line: null });
    }
  });

  const hreflang = root.querySelectorAll('link[rel="alternate"][hreflang]');
  if (hreflang.length > 0) {
    const hasDefault = hreflang.some((node) => node.getAttribute("hreflang") === "x-default");
    if (!hasDefault) {
      addIssue(fileReport, { type: "missing_hreflang_default", severity: "warning", message: "hreflang present but missing x-default.", details: {}, line: null });
    }
  }

  root.querySelectorAll('link[rel="canonical"],meta[property^="og:"],script[type="application/ld+json"]').forEach((node) => {
    const value = node.getAttribute("href") || node.getAttribute("content") || textContent(node);
    if (typeof value === "string" && value.includes("http://")) {
      addIssue(fileReport, { type: "mixed_content", severity: "warning", message: "Found http:// in SEO URL.", details: {}, line: null });
    }
  });

  const tokens = tokenize(normalizedBody).slice(0, 1000);
  const titleKey = normalizeText(titleText);
  const descriptionKey = normalizeText(metaDescContent);

  analysisCache.set(fileReport.path, {
    tokens: new Set(tokens),
    wordCount,
    internalLinks,
    title: titleKey,
    description: descriptionKey,
    guessedPath: fileReport.guessed_path,
  });
}

function applyFixes(filePath, raw, fileReport) {
  let updated = raw;
  let changed = false;

  const addFix = (type, detail, index) => {
    fileReport.fixes_applied.push({ type, detail, line: lineNumberAt(updated, index) });
  };

  const insertIntoHead = (snippet, type, detail) => {
    const headMatch = updated.match(/<head[^>]*>/i);
    if (!headMatch) return false;
    const insertIndex = updated.indexOf(headMatch[0]) + headMatch[0].length;
    updated = `${updated.slice(0, insertIndex)}\n    ${snippet}${updated.slice(insertIndex)}`;
    addFix(type, detail, insertIndex);
    changed = true;
    return true;
  };

  if (fileReport.issues.some((issue) => issue.type === "img_missing_alt")) {
    const imgRegex = /<img\b(?![^>]*\balt=)[^>]*>/gi;
    updated = updated.replace(imgRegex, (match, offset) => {
      changed = true;
      addFix("img_alt", "Inserted alt placeholder.", offset);
      return match.replace(/<img\b/, '<img alt="TODO: describe image"');
    });
  }

  if (fileReport.issues.some((issue) => issue.type === "missing_title")) {
    const titleRegex = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
    if (titleRegex.test(updated)) {
      let updatedOnce = false;
      updated = updated.replace(titleRegex, (match, inner, offset) => {
        if (updatedOnce) return match;
        updatedOnce = true;
        if (inner && inner.trim()) return match;
        addFix("title", "Filled empty <title> placeholder.", offset);
        changed = true;
        return match.replace(inner, "TODO");
      });
    } else {
      insertIntoHead("<title>TODO</title>", "title", "Inserted <title> placeholder.");
    }
  }

  if (fileReport.issues.some((issue) => issue.type === "missing_meta_description")) {
    const metaRegex = /<meta\b[^>]*name=["']description["'][^>]*>/i;
    if (metaRegex.test(updated)) {
      let updatedOnce = false;
      updated = updated.replace(metaRegex, (match, offset) => {
        if (updatedOnce) return match;
        updatedOnce = true;
        const contentMatch = match.match(/content=["']([^"']*)["']/i);
        if (contentMatch && contentMatch[1].trim()) return match;
        const replacement = contentMatch
          ? match.replace(/content=["'][^"']*["']/i, 'content="TODO"')
          : match.replace(/<meta\b/i, '<meta content="TODO"');
        addFix("meta_description", "Filled meta description placeholder.", offset);
        changed = true;
        return replacement;
      });
    } else {
      insertIntoHead('<meta name="description" content="TODO">', "meta_description", "Inserted meta description placeholder.");
    }
  }

  if (fileReport.issues.some((issue) => issue.type === "missing_canonical")) {
    const canonicalRegex = /<link\b[^>]*rel=["']canonical["'][^>]*>/i;
    if (canonicalRegex.test(updated)) {
      let updatedOnce = false;
      updated = updated.replace(canonicalRegex, (match, offset) => {
        if (updatedOnce) return match;
        updatedOnce = true;
        const hrefMatch = match.match(/href=["']([^"']*)["']/i);
        if (hrefMatch && hrefMatch[1].trim()) return match;
        const replacement = hrefMatch
          ? match.replace(/href=["'][^"']*["']/i, 'href="{{ url()->current() }}"')
          : match.replace(/<link\b/i, '<link href="{{ url()->current() }}"');
        addFix("canonical", "Filled canonical placeholder.", offset);
        changed = true;
        return replacement;
      });
    } else {
      insertIntoHead('<link rel="canonical" href="{{ url()->current() }}">', "canonical", "Inserted canonical placeholder.");
    }
  }

  if (fileReport.issues.some((issue) => issue.type === "missing_og")) {
    const ogDefaults = {
      "og:title": "TODO",
      "og:description": "TODO",
      "og:url": "{{ url()->current() }}",
      "og:type": "website",
      "og:image": "TODO",
    };
    const ogMissing = fileReport.issues
      .filter((issue) => issue.type === "missing_og")
      .map((issue) => issue.details?.property)
      .filter(Boolean);
    const ogTargets = ogMissing.length ? ogMissing : Object.keys(ogDefaults);
    ogTargets.forEach((property) => {
      const regex = new RegExp(`<meta\\b[^>]*property=["']${escapeRegExp(property)}["'][^>]*>`, "i");
      if (regex.test(updated)) {
        let updatedOnce = false;
        updated = updated.replace(regex, (match, offset) => {
          if (updatedOnce) return match;
          updatedOnce = true;
          const contentMatch = match.match(/content=["']([^"']*)["']/i);
          if (contentMatch && contentMatch[1].trim()) return match;
          const replacement = contentMatch
            ? match.replace(/content=["'][^"']*["']/i, `content="${ogDefaults[property]}"`)
            : match.replace(/<meta\b/i, `<meta content="${ogDefaults[property]}"`);
          addFix("opengraph", `Filled ${property} placeholder.`, offset);
          changed = true;
          return replacement;
        });
      } else {
        insertIntoHead(`<meta property="${property}" content="${ogDefaults[property]}">`, "opengraph", `Inserted ${property} placeholder.`);
      }
    });
  }

  if (fileReport.issues.some((issue) => issue.type === "missing_twitter")) {
    const twitterDefaults = {
      "twitter:card": "summary_large_image",
      "twitter:title": "TODO",
      "twitter:description": "TODO",
      "twitter:image": "TODO",
    };
    const twitterMissing = fileReport.issues
      .filter((issue) => issue.type === "missing_twitter")
      .map((issue) => issue.details?.name)
      .filter(Boolean);
    const twitterTargets = twitterMissing.length ? twitterMissing : Object.keys(twitterDefaults);
    twitterTargets.forEach((name) => {
      const regex = new RegExp(`<meta\\b[^>]*name=["']${escapeRegExp(name)}["'][^>]*>`, "i");
      if (regex.test(updated)) {
        let updatedOnce = false;
        updated = updated.replace(regex, (match, offset) => {
          if (updatedOnce) return match;
          updatedOnce = true;
          const contentMatch = match.match(/content=["']([^"']*)["']/i);
          if (contentMatch && contentMatch[1].trim()) return match;
          const replacement = contentMatch
            ? match.replace(/content=["'][^"']*["']/i, `content="${twitterDefaults[name]}"`)
            : match.replace(/<meta\b/i, `<meta content="${twitterDefaults[name]}"`);
          addFix("twitter", `Filled ${name} placeholder.`, offset);
          changed = true;
          return replacement;
        });
      } else {
        insertIntoHead(`<meta name="${name}" content="${twitterDefaults[name]}">`, "twitter", `Inserted ${name} placeholder.`);
      }
    });
  }

  if (changed) {
    writeFileSafe(filePath, updated);
  }
}

function scanBladeFile(filePath, appUrl) {
  const raw = readFileSafe(filePath);
  if (raw === null) {
    return;
  }

  const cleaned = stripBlade(raw);

  const fileReport = {
    path: filePath,
    score: 100,
    issues: [],
    stats: {
      h1_count: 0,
      word_count: 0,
      text_html_ratio: 0,
    },
    fixes_applied: [],
    guessed_path: guessPath(filePath),
  };

  scanHtml(cleaned, fileReport, appUrl);

  if (appUrl && fileReport.guessed_path && fileReport.guessed_path !== "/") {
    const canonicalIssue = fileReport.issues.find((issue) => issue.type === "missing_canonical");
    if (!canonicalIssue) {
      const canonical = cleaned.match(/<link[^>]+rel=["']canonical["'][^>]+>/i);
      if (canonical) {
        const hrefMatch = canonical[0].match(/href=["']([^"']+)["']/i);
        const canonicalHref = hrefMatch ? hrefMatch[1] : null;
        if (canonicalHref && canonicalHref.startsWith(appUrl)) {
          const expected = normalizePath(fileReport.guessed_path);
          const actual = normalizePath(canonicalHref.replace(appUrl, "")) || "/";
          if (expected && actual && expected !== actual) {
            addIssue(fileReport, { type: "canonical_path_mismatch", severity: "suggestion", message: "Canonical path differs from view path (heuristic).", details: { expected, actual }, line: null });
          }
        }
      }
    }
  }

  if (fixMode) {
    applyFixes(filePath, raw, fileReport);
  }

  files.push(fileReport);
}

async function scanHttpPages(appUrl) {
  if (!appUrl || typeof fetch !== "function") {
    return;
  }
  const routes = extractStaticRoutes();

  for (const route of routes) {
    const url = `${appUrl}${route}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        continue;
      }
      const html = await response.text();
      const fileReport = {
        path: url,
        score: 100,
        issues: [],
        stats: {
          h1_count: 0,
          word_count: 0,
          text_html_ratio: 0,
        },
        fixes_applied: [],
        guessed_path: route,
      };
      scanHtml(html, fileReport, appUrl);
      files.push(fileReport);
    } catch {
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function scanRobots(appUrl) {
  const robotsPath = path.join(publicRoot, "robots.txt");
  const raw = readFileSafe(robotsPath);
  if (raw === null) {
    issues.push({ type: "missing_robots", severity: "error", message: "Missing public/robots.txt", details: { path: robotsPath } });
    if (fixMode) {
      const sitemap = appUrl ? `${appUrl}/sitemap.xml` : "TODO";
      const contents = `User-agent: *\nDisallow:\n\nSitemap: ${sitemap}\n`;
      writeFileSafe(robotsPath, contents);
      issues.push({ type: "robots_created", severity: "suggestion", message: "Created placeholder robots.txt.", details: { path: robotsPath } });
    }
    return;
  }

  if (!/User-agent:/i.test(raw)) {
    issues.push({ type: "robots_missing_user_agent", severity: "error", message: "robots.txt missing User-agent.", details: { path: robotsPath } });
  }
  if (!/Sitemap:/i.test(raw)) {
    issues.push({ type: "robots_missing_sitemap", severity: "warning", message: "robots.txt missing Sitemap.", details: { path: robotsPath } });
  }

  const blocks = raw.split(/\n\s*\n/);
  blocks.forEach((block) => {
    const hasWildcard = /User-agent:\s*\*/i.test(block);
    const disallowAll = /Disallow:\s*\//i.test(block);
    if (hasWildcard && disallowAll) {
      issues.push({ type: "robots_disallow_all", severity: "warning", message: "robots.txt disallows all for User-agent *.", details: { path: robotsPath } });
    }
  });

  if (appUrl) {
    const sitemapMatch = raw.match(/Sitemap:\s*(\S+)/i);
    if (sitemapMatch && !sitemapMatch[1].startsWith(appUrl)) {
      issues.push({ type: "robots_sitemap_mismatch", severity: "warning", message: "Sitemap URL in robots.txt does not match app URL base.", details: { appUrl } });
    }
  }
}

function scanSitemaps(appUrl) {
  const entries = fs.existsSync(publicRoot) ? fs.readdirSync(publicRoot).filter((name) => name.startsWith("sitemap") && name.endsWith(".xml")) : [];
  if (entries.length === 0) {
    issues.push({ type: "missing_sitemap", severity: "error", message: "No sitemap.xml found in public/.", details: { path: publicRoot } });
    if (fixMode) {
      const sitemapPath = path.join(publicRoot, "sitemap.xml");
      const url = appUrl ? `${appUrl}/` : "TODO";
      const contents = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n  <url>\n    <loc>${url}</loc>\n    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>\n`;
      writeFileSafe(sitemapPath, contents);
      issues.push({ type: "sitemap_created", severity: "suggestion", message: "Created placeholder sitemap.xml.", details: { path: sitemapPath } });
    }
    return;
  }

  const sitemapUrls = [];
  for (const name of entries) {
    const fp = path.join(publicRoot, name);
    const raw = readFileSafe(fp);
    if (raw === null) {
      continue;
    }
    let doc;
    try {
      doc = new DOMParser().parseFromString(raw, "text/xml");
    } catch {
      issues.push({ type: "invalid_sitemap_xml", severity: "error", message: "Sitemap XML is invalid.", details: { path: fp } });
      continue;
    }
    const urlNodes = Array.from(doc.getElementsByTagName("url"));
    urlNodes.forEach((node) => {
      const loc = node.getElementsByTagName("loc")[0]?.textContent || "";
      const lastmod = node.getElementsByTagName("lastmod")[0]?.textContent || "";
      const changefreq = node.getElementsByTagName("changefreq")[0]?.textContent || "";
      const priority = node.getElementsByTagName("priority")[0]?.textContent || "";

      if (!loc) {
        issues.push({ type: "sitemap_missing_loc", severity: "error", message: "Sitemap entry missing <loc>.", details: { path: fp } });
      } else {
        sitemapUrls.push(loc);
        if (appUrl && !loc.startsWith(appUrl)) {
          issues.push({ type: "sitemap_loc_mismatch", severity: "warning", message: "Sitemap URL does not match app URL base.", details: { loc, appUrl } });
        }
      }

      if (!lastmod) {
        issues.push({ type: "sitemap_missing_lastmod", severity: "suggestion", message: "Sitemap entry missing <lastmod>.", details: { path: fp } });
      }
      if (!changefreq) {
        issues.push({ type: "sitemap_missing_changefreq", severity: "suggestion", message: "Sitemap entry missing <changefreq>.", details: { path: fp } });
      }
      if (!priority) {
        issues.push({ type: "sitemap_missing_priority", severity: "suggestion", message: "Sitemap entry missing <priority>.", details: { path: fp } });
      }
    });
  }
  if (entries.length > 1) {
    const hasIndex = entries.some((name) => name.includes("index"));
    if (!hasIndex) {
      issues.push({ type: "missing_sitemap_index", severity: "warning", message: "Multiple sitemaps found without index.", details: { entries } });
    }
  }

  if (sitemapUrls.length === 0) {
    return;
  }
}

function scanRoutes() {
  const routesPath = path.join(routesRoot, "web.php");
  const raw = readFileSafe(routesPath);
  if (!raw) {
    return;
  }
  const redirectMatches = raw.match(/Route::redirect\([^\)]*\)/g) || [];
  redirectMatches.forEach((entry) => {
    if (!/,\s*301\s*\)/.test(entry)) {
      issues.push({ type: "redirect_not_301", severity: "suggestion", message: "Route::redirect without explicit 301.", details: { entry } });
    }
  });
}

function runProjectWideChecks() {
  const titleMap = new Map();
  const descriptionMap = new Map();
  const pathToFile = new Map();
  const inbound = new Map();

  files.forEach((file) => {
    const data = analysisCache.get(file.path);
    if (!data) return;

    if (data.title) {
      titleMap.set(data.title, [...(titleMap.get(data.title) || []), file.path]);
    }
    if (data.description) {
      descriptionMap.set(data.description, [...(descriptionMap.get(data.description) || []), file.path]);
    }

    if (data.guessedPath) {
      pathToFile.set(data.guessedPath, file.path);
      inbound.set(data.guessedPath, inbound.get(data.guessedPath) || 0);
    }
  });

  titleMap.forEach((paths) => {
    if (paths.length > 1) {
      issues.push({ type: "duplicate_title", severity: "warning", message: "Duplicate <title> across views.", details: { files: paths } });
    }
  });

  descriptionMap.forEach((paths) => {
    if (paths.length > 1) {
      issues.push({ type: "duplicate_meta_description", severity: "warning", message: "Duplicate meta description across views.", details: { files: paths } });
    }
  });

  files.forEach((file) => {
    const data = analysisCache.get(file.path);
    if (!data) return;
    data.internalLinks.forEach((link) => {
      if (!link) return;
      const normalized = normalizePath(link);
      if (pathToFile.has(normalized)) {
        inbound.set(normalized, (inbound.get(normalized) || 0) + 1);
      }
    });
  });

  inbound.forEach((count, pathKey) => {
    if (pathKey === "/") return;
    if (count === 0) {
      const filePath = pathToFile.get(pathKey);
      const file = files.find((entry) => entry.path === filePath);
      if (file) {
        addIssue(file, { type: "orphan_page", severity: "suggestion", message: "Page appears orphaned (no inbound internal links).", details: { path: pathKey }, line: null });
      }
    }
    const depth = pathKey.split("/").filter(Boolean).length;
    if (depth > 3 && count < 2) {
      const filePath = pathToFile.get(pathKey);
      const file = files.find((entry) => entry.path === filePath);
      if (file) {
        addIssue(file, { type: "deep_page", severity: "suggestion", message: "Deep page with weak internal linking.", details: { path: pathKey, depth, inbound: count }, line: null });
      }
    }
  });

  const fileList = Array.from(analysisCache.entries());
  for (let i = 0; i < fileList.length; i += 1) {
    const [pathA, dataA] = fileList[i];
    for (let j = i + 1; j < fileList.length; j += 1) {
      const [pathB, dataB] = fileList[j];
      if (dataA.wordCount < 200 || dataB.wordCount < 200) {
        continue;
      }
      const similarity = jaccard(dataA.tokens, dataB.tokens);
      if (similarity > 0.85) {
        const fileA = files.find((entry) => entry.path === pathA);
        const fileB = files.find((entry) => entry.path === pathB);
        if (fileA) {
          addIssue(fileA, { type: "duplicate_content", severity: "warning", message: "Content is highly similar to another view.", details: { other: pathB, similarity: Number(similarity.toFixed(2)) }, line: null });
        }
        if (fileB) {
          addIssue(fileB, { type: "duplicate_content", severity: "warning", message: "Content is highly similar to another view.", details: { other: pathA, similarity: Number(similarity.toFixed(2)) }, line: null });
        }
      }
    }
  }
}

function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  setA.forEach((value) => {
    if (setB.has(value)) intersection += 1;
  });
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function scoreIssues(list) {
  let score = 100;
  list.forEach((issue) => {
    if (issue.severity === "error") score -= 10;
    if (issue.severity === "warning") score -= 5;
    if (issue.severity === "suggestion") score -= 2;
  });
  return Math.max(0, Math.min(100, score));
}

function scoreFile(file) {
  file.score = scoreIssues(file.issues);
}

function scoreProject(files, projectIssues) {
  const total = files.reduce((sum, file) => sum + file.score, 0);
  const base = files.length ? Math.round(total / files.length) : 100;
  const projectPenalty = 100 - scoreIssues(projectIssues || []);
  return Math.max(0, Math.min(100, base - projectPenalty));
}

async function run() {
  const appUrl = readAppUrl();

  if (useHttp) {
    await scanHttpPages(appUrl);
  } else if (fs.existsSync(viewRoot)) {
    const walk = (dir) => {
      fs.readdirSync(dir).forEach((name) => {
        const fp = path.join(dir, name);
        if (fs.statSync(fp).isDirectory()) {
          walk(fp);
        } else if (fp.endsWith(".blade.php")) {
          scanBladeFile(fp, appUrl);
        }
      });
    };
    walk(viewRoot);
  }

  scanRobots(appUrl);
  scanSitemaps(appUrl);
  scanRoutes();

  runProjectWideChecks();
  files.forEach(scoreFile);

  const report = {
    summary: {
      files_scanned: files.length,
      files_with_issues: files.filter((file) => file.issues.length > 0).length,
      total_issues: files.reduce((sum, file) => sum + file.issues.length, 0) + issues.length,
      project_score: scoreProject(files, issues),
    },
    files,
    project_issues: issues,
  };

  console.log(JSON.stringify(report, null, 2));
}

run();
