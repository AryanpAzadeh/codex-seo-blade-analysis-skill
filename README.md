# seo-blade-analysis

این ریپازیتوری یک Skill برای Codex است که اسکن جامع سئو برای پروژه‌های Laravel انجام می‌دهد (Blade + فایل‌های تکنیکال سئو). خروجی فقط JSON است و در صورت درخواست با `--fix` برخی اصلاحات امن را اعمال می‌کند.

## قابلیت‌ها

- بررسی ساختار تیترها (H1 و سلسله‌مراتب هدینگ‌ها)
- بررسی Title و Meta Description
- بررسی Canonical و کیفیت آن
- بررسی OpenGraph و Twitter Card
- بررسی تصاویر (alt / lazy / ابعاد)
- بررسی لینک‌ها و کیفیت Anchor Text
- تشخیص صفحات Thin Content
- بررسی Structured Data (JSON-LD)
- بررسی Duplicate Title/Description و Duplicate Content (پروژه‌ای)
- بررسی robots.txt و sitemap.xml
- بررسی hreflang و mixed content
- بررسی redirect های 301 در routes/web.php

## پیش‌نیازها

- Node.js نسخه 18 یا بالاتر (برای `fetch` داخلی در حالت `--http`)
- دسترسی به سورس پروژه Laravel که می‌خواهید اسکن شود

## نصب وابستگی‌ها

این اسکریپت از `node-html-parser` و `xmldom` استفاده می‌کند. اگر این ریپو را به تنهایی اجرا می‌کنید، کافی است در همین ریپو نصب کنید:

```bash
npm init -y
npm install node-html-parser xmldom
```

اگر اسکریپت را داخل پروژه Laravel خود قرار می‌دهید، می‌توانید همین وابستگی‌ها را در همان پروژه نصب کنید.

## نحوه اجرا

اسکریپت بر اساس `process.cwd()` مسیر پروژه را تشخیص می‌دهد، پس باید از ریشه پروژه Laravel اجرا شود یا `cwd` را روی ریشه پروژه بگذارید.

### اجرا از داخل پروژه Laravel

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js
```

به صورت پیش‌فرض خروجی خلاصه است (summary + لیست فایل‌ها با score و تعداد issues).

### اجرا با اصلاحات امن (`--fix`)

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --fix
```

### اجرا روی صفحات رندر شده (`--http`)

این حالت نیاز دارد اپ Laravel در حال اجرا باشد و `APP_URL` درست تنظیم شده باشد.

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --http
```

### تعیین دستی APP_URL

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --http --app-url https://your-app.test
```

### خروجی کامل (`--full`)

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --full
```

### خروجی فقط برای یک فایل (`--file` یا `--only`)

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --full --file resources/views/home.blade.php
```

### صفحه‌بندی لیست فایل‌ها (`--limit` / `--offset`)

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --limit 20 --offset 0
```

### اضافه کردن project_issues در خروجی خلاصه

```bash
node /path/to/seo-blade-analysis/scripts/analyze-seo.js --project-issues
```

## خروجی

- خروجی فقط JSON است و روی stdout چاپ می‌شود.
- ساختار دقیق خروجی در `SKILL.md` توضیح داده شده است.
- خروجی پیش‌فرض خلاصه است: `summary` + لیست فایل‌ها با `score` و `issues_count`.
- با `--full` خروجی کامل per-file و `project_issues` برمی‌گردد.

## Fix Mode چه کار می‌کند؟

فقط اصلاحات امن انجام می‌شود، از جمله:

- افزودن `alt` به تصویرهای بدون alt
- افزودن `<title>` و `<meta name="description">` placeholder
- افزودن OpenGraph و Twitter placeholders
- افزودن canonical با `{{ url()->current() }}`
- ساخت `public/robots.txt` و `public/sitemap.xml` اگر وجود نداشته باشد

موارد محتوایی، هدینگ‌ها، hreflang و Structured Data به صورت خودکار تغییر داده نمی‌شوند.

## محدودیت‌ها

- تحلیل محتوا برای Blade به صورت استاتیک است و متغیرها با `__DYNAMIC__` جایگزین می‌شوند.
- حالت `--http` فقط روت‌های استاتیک ساده را از `routes/web.php` استخراج می‌کند.
- نتایج بر پایه heuristic است و ممکن است نیاز به بررسی دستی داشته باشد.

## نحوه نصب به عنوان Skill در Codex

اگر می‌خواهید این Skill را به Codex اضافه کنید:

1. نصب سریع (یک‌خطی) در مسیر استاندارد کاربر:

```bash
git clone https://github.com/AryanpAzadeh/codex-seo-blade-analysis-skill.git "$HOME/.agents/skills/seo-blade-analysis"
```

2. مطمئن شوید فایل `SKILL.md` در همان مسیر است.
3. در صورت نیاز:

```bash
chmod +x scripts/analyze-seo.js
```

### نصب با Skill Installer

اگر Skill Installer در دسترس است:

```bash
$skill-installer install https://github.com/AryanpAzadeh/codex-seo-blade-analysis-skill
```

Codex به صورت پیش‌فرض Skillها را از مسیرهای `.agents/skills` (در سطح پروژه یا کاربر) می‌خواند. اگر پس از نصب Skill در لیست نبود، Codex را ری‌استارت کنید.

## آپدیت Skill

اگر Skill را با `git clone` نصب کرده‌اید، کافی است در همان پوشه `git pull` بزنید:

```bash
cd "$HOME/.agents/skills/seo-blade-analysis"
git pull
```

اگر Skill داخل یک پروژه نصب شده است:

```bash
cd /path/to/project/.agents/skills/seo-blade-analysis
git pull
```

اگر با `$skill-installer` نصب شده، همان دستور نصب را دوباره اجرا کنید:

```bash
$skill-installer install https://github.com/AryanpAzadeh/codex-seo-blade-analysis-skill
```

## منابع

- قوانین سئو: `references/seo-rules.md`
- تعریف و خروجی Skill: `SKILL.md`
- اسکریپت اسکن: `scripts/analyze-seo.js`

## لایسنس

این پروژه تحت لایسنس MIT منتشر شده است و استفاده در هر نوع پروژه (شخصی، تجاری، متن‌باز) مجاز است. جزئیات در فایل‌های `LICENSE` و `LICENSE.txt` آمده است.
