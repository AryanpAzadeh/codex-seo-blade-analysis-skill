---
name: seo-blade-analysis
description: Use when asked to scan or fix SEO issues in Laravel projects that use Blade templates (HTML structure) plus technical SEO files. Not for non-Laravel stacks or general SEO strategy. Outputs JSON only and supports optional safe fixes.
---

# Seo Blade Analysis

## Overview

Perform a full SEO audit for Laravel projects. Analyze Blade templates (HTML structure) plus technical SEO files and configuration. Ignore Blade syntax and treat dynamic variables as placeholders when assessing content. The script output is JSON-only. After showing JSON, you may add a brief, human-friendly follow-up (questions + next-step suggestions) unless the user explicitly requested JSON-only or raw output. If user asks to fix, apply safe automatic fixes.

## Workflow

1. Collect target paths. Default:
   - Blade: `resources/views/**/*.blade.php`
   - Technical SEO: `public/robots.txt`, `public/sitemap.xml`, `public/sitemap*.xml`, `public/humans.txt`
   - App config: `config/app.php`, `config/view.php`, `config/filesystems.php`, `routes/web.php`
2. Optional rendering mode for higher fidelity:
   - If app is running (Laravel Herd), fetch HTML from `APP_URL` for static routes and analyze rendered HTML.
   - Use script mode `--http` and optionally `--app-url https://your-app.test` to enable.
3. For each Blade file, strip Blade syntax while preserving HTML structure:
   - Remove Blade directives: `@if`, `@elseif`, `@else`, `@endif`, `@foreach`, `@endforeach`, `@for`, `@endfor`, `@while`, `@endwhile`, `@switch`, `@case`, `@break`, `@default`, `@endswitch`, `@extends`, `@section`, `@endsection`, `@yield`, `@include`, `@includeIf`, `@includeWhen`, `@includeUnless`, `@stack`, `@push`, `@endpush`, `@prepend`, `@endprepend`, `@csrf`, `@method`, `@vite`, `@once`, `@endonce`, `@production`, `@endproduction`, `@verbatim`, `@endverbatim`.
   - Replace `{{ ... }}` and `{!! ... !!}` with `__DYNAMIC__`.
4. Parse normalized HTML and run the checks in the order below.
5. Parse technical SEO files and route config checks in the order below.
6. Produce JSON with per-file issues, summary counts, and scoring. No prose in the JSON.
   - Default output is a compact JSON summary plus file list with score and issue count.
   - Use `--full` to return full per-file issues and `project_issues`.
7. If the user did not request raw/JSON-only output, add a short follow-up after the JSON:
   - Ask 2-3 concise questions (e.g., which file to expand, whether to apply fixes).
   - Suggest the exact flag(s) to use next (e.g., `--full --file`, `--project-issues`).

## Checks

### A. Template SEO (Blade/HTML)

#### 1. Exactly One H1

- Count `<h1>` elements.
- Issue if count is `0` or `>1`.

#### 2. Img Tags Without Alt

- Flag any `<img>` missing `alt` or with an empty `alt` after trimming.
- Flag generic `alt` text (e.g., image, photo, logo).
- Flag missing `width`/`height`.
- Flag missing `loading="lazy"`.

#### 3. Missing Title Tag

- Require a non-empty `<title>` within `<head>`.

#### 4. Missing Meta Description

- Require `<meta name="description" content="...">` with non-empty content.
- Suggest if description length is outside 120-160 characters.

#### 5. Canonical Quality

- Require `<link rel="canonical" href="...">` with non-empty href.
- Canonical must be absolute and preferably HTTPS.
- Flag multiple canonicals.
- Suggest if canonical contains query params.
- Suggest if canonical path differs from view path (heuristic).

#### 6. OpenGraph Tags

- Require non-empty `content` for: `og:title`, `og:description`, `og:url`, `og:type`, `og:image`.
- Suggest `og:locale` and `og:site_name`.

#### 7. Links & Anchors

- Flag `<a>` elements whose inner text is empty after stripping HTML and trimming, and that do not contain a `__DYNAMIC__` placeholder.
- Flag empty or non-navigable `href` (e.g., `#`, `javascript:void(0)`).
- Flag generic anchor text (e.g., “click here”).
- Flag internal URLs with non-SEO slugs (uppercase or underscores).

#### 8. Thin Content Pages

- Compute visible text word count from HTML body after stripping tags; treat `__DYNAMIC__` as a word.
- Compute text-to-HTML ratio: visible text length / total HTML length (after Blade stripping).
- Flag if word count is `< 300` or ratio is `< 0.15`.

#### 9. Heading Hierarchy Issues

- Headings must start at `h1`.
- Flag if the first heading level is `h2` or deeper.
- Flag any jump greater than one level (e.g., `h2` -> `h4`, `h3` -> `h5`).

#### 10. Duplicate Titles or Descriptions (Project-wide)

- Collect titles and meta descriptions across views.
- Flag duplicates with a project-wide issue in `project_issues` referencing all files.

#### 11. Structured Data (JSON-LD)

- Detect `<script type="application/ld+json">`.
- Flag missing if page appears to be content-heavy (word count >= 600).
- Validate JSON parseable if present.
- Validate required fields for common types (Organization, WebSite, WebPage, Article, BlogPosting, Product, BreadcrumbList).

#### 12. OpenGraph/Twitter Coverage

- Require `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image` for public pages.
- Suggest `twitter:site`.

#### 13. Internal Link Graph (Project-wide)

- Build an internal link graph (heuristic using view path guesses).
- Flag orphan pages (no inbound internal links).
- Flag deep pages (path depth > 3) if weakly linked.

#### 14. Duplicate Content (Project-wide)

- Compute similarity between view texts.
- Flag highly similar content (Jaccard > 0.85) for pages with >= 200 words.

### B. Technical SEO

#### 1. robots.txt

- Require `public/robots.txt`.
- Flag missing `User-agent` and `Sitemap` directives.
- Warn on `Disallow: /` for `User-agent: *`.
- Warn if Sitemap URL does not match app base URL.

#### 2. sitemap.xml

- Require a sitemap file in `public/`.
- If multiple sitemaps exist, require an index.
- Validate XML parseable.
- Check `<loc>`, `<lastmod>`, `<changefreq>`, `<priority>` for each entry.
- Warn if sitemap URLs do not match app base URL.

#### 3. Canonical Consistency

- Flag canonical `href` that is relative or empty.
- If base URL known (from config/app.php `url`), ensure canonical begins with it.

#### 4. hreflang

- Detect `<link rel="alternate" hreflang="...">`.
- If any hreflang exists, require `x-default`.

#### 5. Redirect Hints (Static)

- Scan `routes/web.php` for permanent redirects (301) if present; suggest 301 for legacy routes when `Route::redirect()` uses 302.

#### 6. Mixed Content (Static)

- Flag `http://` in canonical, OG image, and JSON-LD URLs.

## Fix Mode

Apply safe automatic fixes only when explicitly requested with "fix":

- Add missing `alt` attributes with placeholder text `TODO: describe image` when `img` has no `alt`.
- Add empty but present `<title>` or `<meta name="description">` placeholders inside `<head>` if `<head>` exists.
- Add OpenGraph and Twitter meta tag placeholders if `<head>` exists.
- Add canonical placeholder using `{{ url()->current() }}`.
- Create placeholder `public/robots.txt` and `public/sitemap.xml` if missing.
- Do not auto-fix headings, thin content, hreflang, structured data, or content quality issues.

Record every change in `fixes_applied` with file path and line numbers if available.

## Scoring

Score 0-100 per file and project-wide:

- Start at 100.
- Deduct:
  - Error: -10 each
  - Warning: -5 each
  - Suggestion: -2 each
- Clamp to [0, 100].

## Output JSON

Return JSON only. Default schema (compact):

```json
{
  "summary": {
    "files_scanned": 0,
    "files_with_issues": 0,
    "total_issues": 0,
    "project_score": 0
  },
  "files": [
    {
      "path": "path/to/view.blade.php",
      "score": 0,
      "issues_count": 0
    }
  ]
}
```

Full schema (`--full`):

```json
{
  "summary": {
    "files_scanned": 0,
    "files_with_issues": 0,
    "total_issues": 0,
    "project_score": 0
  },
  "files": [
    {
      "path": "path/to/view.blade.php",
      "score": 0,
      "issues": [
        {
          "type": "missing_title",
          "severity": "error",
          "message": "Missing or empty <title> in <head>.",
          "details": {},
          "line": null
        }
      ],
      "stats": {
        "h1_count": 0,
        "word_count": 0,
        "text_html_ratio": 0
      },
      "fixes_applied": [],
      "guessed_path": "/example"
    }
  ],
  "project_issues": []
}
```

Optional flags:
- `--full`: return full per-file issues and `project_issues`.
- `--project-issues`: include `project_issues` in compact mode.
- `--file <path>` or `--only <path>`: return only a single file report (exact match or suffix).
- `--limit N` / `--offset N`: paginate the file list.

Interactive helper:
- `assistant_followup`: A JSON block with follow-up questions and tips to help users interpret results.

## Resources

- Use `references/seo-rules.md` for rule definitions and severity defaults.
- Use `scripts/analyze-seo.js` if present for deterministic scanning.
- Script options:
  - `--fix` to apply safe fixes.
  - `--http` to analyze live rendered pages (requires app running).
  - `--app-url` to override APP_URL base.
- Script dependencies: `node-html-parser`, `xmldom`.
