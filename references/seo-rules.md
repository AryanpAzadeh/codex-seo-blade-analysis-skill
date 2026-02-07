# Laravel SEO Rules

## Severity Defaults

- Error: missing essential tags or invalid structure
- Warning: quality gaps that risk ranking issues
- Suggestion: improvements that are helpful but not required

## Template SEO Rules

### 1. Heading Structure

- Must have exactly one H1 per view (Error if 0, Warning if >1)
- Heading hierarchy must not jump more than one level (Warning)
- First heading must be H1 (Error)

### 2. Metadata

- <title> exists and non-empty (Error)
- <meta name="description"> exists and non-empty (Error)
- Description length 120-160 chars is preferred (Suggestion outside range)
- <link rel="canonical"> exists and non-empty (Error)
- Canonical must be absolute (Error)
- Canonical should be HTTPS (Warning)
- Multiple canonicals (Error)
- Canonical with query params (Suggestion)
- Canonical path should match view path (Suggestion, heuristic)

### 3. OpenGraph

Require non-empty content for:
- og:title (Error)
- og:description (Error)
- og:image (Error)
- og:url (Error)
- og:type (Warning if missing, Error if empty)

Suggested:
- og:locale
- og:site_name

### 4. Twitter Cards

Require non-empty content for:
- twitter:card (Warning)
- twitter:title (Warning)
- twitter:description (Warning)
- twitter:image (Warning)

Suggested:
- twitter:site

### 5. Images

- <img> must have non-empty alt (Error)
- Alt text should not be generic (Suggestion)
- Include width/height (Suggestion)
- Include loading="lazy" (Suggestion)

### 6. Links

- <a> must have meaningful text; empty anchors are Errors
- href must not be empty, #, or javascript:void(0) (Warning)
- Anchor text should not be generic (Suggestion)
- Internal URLs should use SEO-friendly slugs (Suggestion)

### 7. Thin Content

- Word count < 300 (Warning)
- Text-to-HTML ratio < 0.15 (Warning)

### 8. Structured Data

- If word count >= 600, require JSON-LD (Suggestion)
- JSON-LD must be parseable JSON (Error if invalid)
- Validate required fields for common types:
  - Organization: name, url
  - WebSite: name, url
  - WebPage: name, description
  - Article/BlogPosting: headline, datePublished, author, image
  - Product: name, image, offers (price, priceCurrency, availability)
  - BreadcrumbList: itemListElement with position, name, item

### 9. Duplicate Content

- Highly similar content across views (Warning, Jaccard > 0.85 for >= 200 words)

### 10. Duplicate Metadata

- Duplicate titles (Warning)
- Duplicate descriptions (Warning)

### 11. Internal Link Graph

- Orphan pages (Suggestion)
- Deep pages (path depth > 3) with weak internal links (Suggestion)

## Technical SEO Rules

### 1. robots.txt

- Must exist in public/ (Error)
- Must contain User-agent (Error)
- Should contain Sitemap (Warning)
- Disallow: / for User-agent * (Warning)
- Sitemap URL should match app base URL (Warning)

### 2. sitemap.xml

- Must exist in public/ (Error)
- Must be valid XML (Error)
- If multiple sitemaps, require index (Warning)
- Each entry should have loc/lastmod/changefreq/priority (Suggestion)
- loc URLs should match app base URL (Warning)

### 3. hreflang

- If any hreflang exists, x-default required (Warning)

### 4. Mixed Content

- http:// in canonical/OG/JSON-LD URLs (Warning)

### 5. Redirect Hints

- Route::redirect without explicit 301 (Suggestion)
