# seo-blade-analysis

This repository provides a Codex Skill that performs a comprehensive SEO audit for Laravel projects (Blade templates + technical SEO files). Output is JSON-only, and `--fix` applies safe, minimal fixes.

## Features

- Heading structure checks (H1 + hierarchy)
- Title and Meta Description checks
- Canonical validation
- OpenGraph and Twitter Card coverage
- Image checks (alt / lazy / dimensions)
- Links and anchor text quality
- Thin content detection
- Structured Data (JSON-LD) validation
- Duplicate title/description and duplicate content (project-wide)
- robots.txt and sitemap.xml checks
- hreflang and mixed content checks
- 301 redirect hints in `routes/web.php`

## Requirements

- Node.js 18+ (needed for built-in `fetch` in `--http` mode)
- Access to the Laravel project you want to scan

## Install Dependencies

The script uses `node-html-parser` and `xmldom`. If you run this repo standalone:

```bash
npm init -y
npm install node-html-parser xmldom
```

If you embed the script in your Laravel project, install the dependencies there.

## How To Run

The script uses `process.cwd()` to locate the project root. Run it from the Laravel root, or set `cwd` accordingly.

### Run from a Laravel project

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js
```

By default, the output is compact (summary + file list with score and issue count).

### Run with safe fixes (`--fix`)

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --fix
```

### Run against rendered pages (`--http`)

This requires the Laravel app to be running and `APP_URL` set correctly.

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --http
```

### Override APP_URL

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --http --app-url https://your-app.test
```

### Full output (`--full`)

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --full
```

### Single file output (`--file` or `--only`)

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --full --file resources/views/home.blade.php
```

### Paginate file list (`--limit` / `--offset`)

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --limit 20 --offset 0
```

### Include project issues in compact output

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --project-issues
```

## Output

- Output is JSON only (printed to stdout).
- The output schema is defined in `SKILL.md`.
- Default output is compact: `summary` + file list with `score` and `issues_count`.
- Use `--full` to return full per-file issues and `project_issues`.
- The `assistant_followup` field includes questions and tips to help interpret the JSON.

## What Fix Mode Does

Only safe automatic fixes are applied:

- Add `alt` to images missing it
- Add `<title>` and `<meta name="description">` placeholders
- Add OpenGraph and Twitter placeholders
- Add canonical with `{{ url()->current() }}`
- Create `public/robots.txt` and `public/sitemap.xml` if missing

Content quality, headings, hreflang, and structured data are not auto-edited.

## Limitations

- Blade is analyzed statically; dynamic values become `__DYNAMIC__`.
- `--http` only discovers simple static routes in `routes/web.php`.
- Heuristics can produce false positives; manual review is still recommended.

## Install As A Codex Skill

To install this skill into Codex:

1. One-line install (standard user path):

```bash
git clone https://github.com/AryanpAzadeh/codex-seo-blade-analysis-skill.git "$HOME/.agents/skills/seo-blade-analysis"
```

2. Ensure `SKILL.md` is in the same folder.
3. If needed:

```bash
chmod +x scripts/analyze-seo.js
```

### Install With Skill Installer

If the Skill Installer is available:

```bash
$skill-installer install https://github.com/AryanpAzadeh/codex-seo-blade-analysis-skill
```

By default, Codex discovers skills from `.agents/skills` (project-level or user-level). If the skill does not appear after install, restart Codex.

## Updating The Skill

If you installed via `git clone`, run `git pull` in the skill folder:

```bash
cd "$HOME/.agents/skills/seo-blade-analysis"
git pull
```

If the skill is installed inside a project:

```bash
cd /path/to/project/.agents/skills/seo-blade-analysis
git pull
```

If installed via `$skill-installer`, re-run the install command:

```bash
$skill-installer install https://github.com/AryanpAzadeh/codex-seo-blade-analysis-skill
```

## Resources

- SEO rules: `references/seo-rules.md`
- Skill definition + output: `SKILL.md`
- Scanner script: `scripts/analyze-seo.js`

## License

This project is licensed under the MIT License and can be used in any type of project (personal, commercial, or open source). See `LICENSE` and `LICENSE.txt`.
