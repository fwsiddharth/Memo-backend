const BASE_URL = "https://animesalt.ac";

const LANGUAGE_MAP = {
  hindi: { label: "Hindi", code: "hin" },
  tamil: { label: "Tamil", code: "tam" },
  telugu: { label: "Telugu", code: "tel" },
  bengali: { label: "Bengali", code: "ben" },
  malayalam: { label: "Malayalam", code: "mal" },
  kannada: { label: "Kannada", code: "kan" },
  english: { label: "English", code: "eng" },
  japanese: { label: "Japanese", code: "jpn" },
  korean: { label: "Korean", code: "kor" },
};

const LANGUAGE_PRIORITY = [
  "hindi",
  "tamil",
  "telugu",
  "bengali",
  "malayalam",
  "kannada",
  "english",
  "japanese",
  "korean",
];

const PLATFORM_LABELS = {
  crunchyroll: "Crunchyroll",
  netflix: "Netflix",
  "sony-yay": "Sony YAY",
  "prime-video": "Prime Video",
  "amazon-prime-video": "Prime Video",
  "disney-hotstar": "Disney+ Hotstar",
  "disney-plus-hotstar": "Disney+ Hotstar",
  "disney-channel": "Disney Channel",
  hotstar: "Disney+ Hotstar",
  disney: "Disney+",
  muse: "Muse",
  hungama: "Hungama TV",
  "hungama-tv": "Hungama TV",
  "toonami-india": "Toonami India",
  "cartoon-network": "Cartoon Network",
};

const STATUS_LABELS = {
  ongoing: "Ongoing",
  completed: "Completed",
  releasing: "Releasing",
};

const DISCOVER_LANGUAGE_OPTIONS = [
  "hindi",
  "tamil",
  "telugu",
  "bengali",
  "malayalam",
  "kannada",
  "english",
  "japanese",
];

const DISCOVER_PLATFORM_OPTIONS = [
  "netflix",
  "crunchyroll",
  "cartoon-network",
  "disney-hotstar",
  "prime-video",
  "sony-yay",
  "hungama-tv",
  "disney-channel",
];

const DISCOVER_SECTION_PRESETS = [
  { id: "hindi-picks", title: "Hindi Picks", language: "hindi" },
  { id: "tamil-dubs", title: "Tamil Dubs", language: "tamil" },
  { id: "netflix", title: "Netflix", platform: "netflix" },
  { id: "crunchyroll", title: "Crunchyroll", platform: "crunchyroll" },
  { id: "cartoon-network", title: "Cartoon Network", platform: "cartoon-network" },
  { id: "disney-hotstar", title: "Disney+ Hotstar", platform: "disney-hotstar" },
];

function decodeHtmlEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return stripTags(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function cleanSourcePath(value) {
  return String(value || "")
    .replace(BASE_URL, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function kindToFormat(kind) {
  return kind === "movie" ? "MOVIE" : "TV";
}

function getAnimeNames(anime) {
  return uniqueStrings([
    anime?.titleEnglish,
    anime?.titleRomaji,
    anime?.titleNative,
    anime?.title,
    ...(Array.isArray(anime?.synonyms) ? anime.synonyms : []),
  ]);
}

function scoreNameMatch(candidate, target) {
  if (!candidate || !target) return 0;
  if (candidate === target) return 100;
  if (candidate.startsWith(target) || target.startsWith(candidate)) return 85;
  if (candidate.includes(target) || target.includes(candidate)) return 70;
  return 0;
}

function titleCaseLabel(value) {
  return String(value || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapPlatformLabel(slug) {
  const key = String(slug || "").trim().toLowerCase();
  return PLATFORM_LABELS[key] || titleCaseLabel(key);
}

function mapStatusLabel(slug) {
  const key = String(slug || "").trim().toLowerCase();
  return STATUS_LABELS[key] || titleCaseLabel(key);
}

function normalizeLanguageSlug(value) {
  const key = String(value || "").trim().toLowerCase();
  if (Object.hasOwn(LANGUAGE_MAP, key)) return key;

  const match = Object.entries(LANGUAGE_MAP).find(
    ([, meta]) => meta.label.toLowerCase() === key,
  );
  return match?.[0] || "";
}

function normalizePlatformSlug(value) {
  const key = String(value || "").trim().toLowerCase();
  if (Object.hasOwn(PLATFORM_LABELS, key)) return key;

  const match = Object.entries(PLATFORM_LABELS).find(
    ([, label]) => label.toLowerCase() === key,
  );
  return match?.[0] || "";
}

function matchesFilters(entry, options = {}) {
  const requestedLanguage = normalizeLanguageSlug(options.language);
  const requestedPlatform = normalizePlatformSlug(options.platform);
  const requestedKind = String(options.kind || "").trim().toLowerCase();

  if (requestedLanguage && !entry.languages.includes(requestedLanguage)) return false;
  if (requestedPlatform && !entry.platforms.includes(requestedPlatform)) return false;
  if (requestedKind && requestedKind !== "all" && entry.kind !== requestedKind) return false;
  return true;
}

function mapEntryToAnime(entry) {
  return {
    id: entry.id,
    source: "animesalt",
    provider: "animesalt",
    title: entry.title,
    titleEnglish: entry.title,
    titleRomaji: entry.title,
    description:
      [
        entry.platforms.length ? entry.platforms.map(mapPlatformLabel).join(" • ") : "",
        entry.languages.length
          ? entry.languages.map((slug) => LANGUAGE_MAP[slug]?.label || titleCaseLabel(slug)).join(" • ")
          : "",
      ]
        .filter(Boolean)
        .join(" · ") || "",
    coverImage: entry.coverImage || null,
    languageSlugs: entry.languages,
    platformSlugs: entry.platforms,
    statusSlugs: entry.statuses,
    languages: entry.languages.map((slug) => LANGUAGE_MAP[slug]?.label || titleCaseLabel(slug)),
    platforms: entry.platforms.map(mapPlatformLabel),
    statuses: entry.statuses.map(mapStatusLabel),
    kind: entry.kind,
    format: kindToFormat(entry.kind),
    href: entry.href,
  };
}

function buildQueryVariants(...values) {
  const variants = [];
  for (const value of values) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    variants.push(raw);

    const normalized = raw
      .replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1")
      .replace(/(\d+)\s*Season/gi, "$1")
      .replace(/Season\s*(\d+)/gi, "$1")
      .replace(/[^a-z0-9\s]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (normalized && normalized !== raw) variants.push(normalized);
  }

  return uniqueStrings(variants);
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`AnimeSalt HTTP ${response.status}`);
  }

  return response.text();
}

function parseCategorySlugs(className) {
  return uniqueStrings(
    String(className || "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.startsWith("category-"))
      .map((token) => token.replace(/^category-/, "")),
  );
}

function pushParsedResult(results, seenIds, className, title, image, href) {
  const cleanHref = String(href || "").trim();
  if (!cleanHref) return;

  const id = cleanSourcePath(cleanHref);
  if (!id || seenIds.has(id)) return;

  const categories = parseCategorySlugs(className);
  const languages = categories.filter((slug) => Object.hasOwn(LANGUAGE_MAP, slug));
  const platforms = categories.filter((slug) => Object.hasOwn(PLATFORM_LABELS, slug));
  const statuses = categories.filter((slug) => Object.hasOwn(STATUS_LABELS, slug));
  const kind = cleanHref.includes("/movies/") ? "movie" : "series";

  results.push({
    id,
    title: stripTags(title),
    href: cleanHref.startsWith("http") ? cleanHref : `${BASE_URL}/${id}/`,
    kind,
    categories,
    languages,
    platforms,
    statuses,
    coverImage: String(image || "").startsWith("//") ? `https:${String(image || "")}` : String(image || ""),
    provider: "animesalt",
  });
  seenIds.add(id);
}

function extractAttribute(block, attributeNames) {
  for (const attributeName of attributeNames) {
    const pattern = new RegExp(`${attributeName}="([^"]+)"`, "i");
    const match = String(block || "").match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function extractSearchResults(html) {
  const results = [];
  const seenIds = new Set();

  const blocks = String(html || "").match(/<li[^>]+class="[^"]+"[^>]*>[\s\S]*?<\/li>/gi) || [];
  for (const block of blocks) {
    if (!/class="[^"]*\b(?:movies|series)\b/i.test(block) || !/class="lnk-blk"/i.test(block)) continue;

    const className = block.match(/<li[^>]+class="([^"]+)"/i)?.[1] || "";
    const title = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || "";
    const href = block.match(/<a href="([^"]+)" class="lnk-blk"><\/a>/i)?.[1] || "";
    const figureBlock = block.match(/<figure[\s\S]*?<\/figure>/i)?.[0] || block;
    const image = extractAttribute(figureBlock, ["data-src", "data-lazy-src", "data-srcset", "src"]);

    pushParsedResult(results, seenIds, className, title, image.split(/\s+/)[0], href);
  }

  return results;
}

function extractMetaContent(html, key) {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const match = String(html || "").match(pattern);
  return match?.[1] ? decodeHtmlEntities(match[1]) : "";
}

function extractFirstHeading(html) {
  const match = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return match?.[1] ? stripTags(match[1]) : "";
}

function extractKnownCategorySlugs(html) {
  const matches = Array.from(String(html || "").matchAll(/\bcategory-([a-z0-9-]+)/gi), (match) => match[1]);
  const unique = uniqueStrings(matches);
  return {
    languages: unique.filter((slug) => Object.hasOwn(LANGUAGE_MAP, slug)),
    platforms: unique.filter((slug) => Object.hasOwn(PLATFORM_LABELS, slug)),
    statuses: unique.filter((slug) => Object.hasOwn(STATUS_LABELS, slug)),
  };
}

function extractCategoryLinks(html, segment) {
  return uniqueStrings(
    Array.from(
      String(html || "").matchAll(new RegExp(`href="${BASE_URL}/category/${segment}/([^"/]+)/"`, "gi")),
      (match) => match[1],
    ),
  );
}

function extractAnimeFromPage(id, html) {
  const url = `${BASE_URL}/${cleanSourcePath(id)}/`;
  const kind = url.includes("/movies/") ? "movie" : "series";
  const ogTitle = extractMetaContent(html, "og:title");
  const headingTitle = extractFirstHeading(html);
  const cleanTitle = (ogTitle || headingTitle || titleCaseLabel(cleanSourcePath(id).split("/").pop()))
    .replace(/\s*-\s*Watch Now[\s\S]*$/i, "")
    .replace(/\s*-\s*Anime Salt[\s\S]*$/i, "")
    .trim();
  const description = stripTags(
    extractMetaContent(html, "og:description") || extractMetaContent(html, "description"),
  );
  const coverImage = extractMetaContent(html, "og:image");
  const known = extractKnownCategorySlugs(html);
  const fallbackLanguages = extractCategoryLinks(html, "language");
  const fallbackPlatforms = extractCategoryLinks(html, "network");
  const fallbackStatuses = extractCategoryLinks(html, "status");
  const languages = known.languages.length ? known.languages : fallbackLanguages;
  const platforms = known.platforms.length ? known.platforms : fallbackPlatforms;
  const statuses = known.statuses.length ? known.statuses : fallbackStatuses;
  const episodesMatch = String(html || "").match(/(\d+)\s+Episodes/i);
  const yearMatch = String(html || "").match(/\b(19|20)\d{2}\b/);

  return {
    id: cleanSourcePath(id),
    href: url,
    source: "animesalt",
    provider: "animesalt",
    title: cleanTitle || "Untitled",
    titleEnglish: cleanTitle || "Untitled",
    titleRomaji: cleanTitle || "Untitled",
    description,
    coverImage: coverImage || null,
    episodes: episodesMatch?.[1] ? Number(episodesMatch[1]) : null,
    seasonYear: yearMatch?.[0] ? Number(yearMatch[0]) : null,
    format: kindToFormat(kind),
    status: statuses[0] ? mapStatusLabel(statuses[0]) : null,
    kind,
    languageSlugs: languages,
    platformSlugs: platforms,
    statusSlugs: statuses,
    languages: languages.map((slug) => LANGUAGE_MAP[slug]?.label || titleCaseLabel(slug)),
    platforms: platforms.map(mapPlatformLabel),
    statuses: statuses.map(mapStatusLabel),
  };
}

async function fetchArchiveHtml(slug, page = 1) {
  const cleanSlug = String(slug || "").trim().toLowerCase();
  if (!cleanSlug) throw new Error("AnimeSalt browse slug is required.");

  const base = `${BASE_URL}/category/${encodeURIComponent(cleanSlug)}/`;
  const urls = page > 1 ? [`${base}page/${page}/`, base] : [base];
  let lastError = null;

  for (const url of urls) {
    try {
      return await fetchHtml(url);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`AnimeSalt category '${cleanSlug}' is unavailable.`);
}

async function browseAnimeSalt(options = {}) {
  const language = normalizeLanguageSlug(options.language);
  const platform = normalizePlatformSlug(options.platform);
  const page = Math.max(1, Number(options.page || 1) || 1);

  if (!language && !platform) {
    throw new Error("AnimeSalt browse requires a language or platform filter.");
  }

  const html = await fetchArchiveHtml(platform || language, page);
  return extractSearchResults(html)
    .filter((entry) => matchesFilters(entry, options))
    .map(mapEntryToAnime);
}

function getBrowseFilters() {
  return {
    languages: DISCOVER_LANGUAGE_OPTIONS.map((slug) => ({
      value: slug,
      label: LANGUAGE_MAP[slug]?.label || titleCaseLabel(slug),
    })),
    platforms: DISCOVER_PLATFORM_OPTIONS.map((slug) => ({
      value: slug,
      label: mapPlatformLabel(slug),
    })),
  };
}

function scoreShowMatch(entry, anime) {
  const entryName = normalizeText(entry?.title);
  const animeNames = getAnimeNames(anime).map(normalizeText);

  let best = 0;
  for (const animeName of animeNames) {
    best = Math.max(best, scoreNameMatch(entryName, animeName));
  }

  const format = String(anime?.format || "").toUpperCase().trim();
  const wantsMovie = format === "MOVIE";
  if (wantsMovie && entry.kind === "movie") best += 4;
  if (!wantsMovie && entry.kind === "series") best += 4;

  if (entry.languages.includes("hindi")) best += 2;
  if (entry.platforms.length) best += 1;

  return best;
}

async function resolveShow(anime) {
  if (anime?.provider === "animesalt") {
    const href = anime?.href ? String(anime.href) : `${BASE_URL}/${cleanSourcePath(anime?.id)}/`;
    return {
      id: cleanSourcePath(anime?.id || href),
      href,
      title: anime?.title || "Untitled",
      kind: String(anime?.kind || "").trim().toLowerCase() || (String(anime?.format || "").toUpperCase() === "MOVIE" ? "movie" : "series"),
      languages: uniqueStrings(anime?.languageSlugs || []),
      platforms: uniqueStrings(anime?.platformSlugs || []),
      statuses: uniqueStrings(anime?.statusSlugs || []),
    };
  }

  const names = buildQueryVariants(...getAnimeNames(anime));
  const byHref = new Map();
  const failures = [];

  for (const name of names) {
    if (name.length < 2) continue;
    try {
      const html = await fetchHtml(`${BASE_URL}/?s=${encodeURIComponent(name)}`);
      for (const result of extractSearchResults(html)) {
        if (!result?.href || byHref.has(result.href)) continue;
        byHref.set(result.href, result);
      }
    } catch (error) {
      failures.push(error?.message || String(error));
    }
  }

  const candidates = Array.from(byHref.values());
  if (!candidates.length) {
    throw new Error(failures[0] || "AnimeSalt title not found for this anime.");
  }

  let best = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = scoreShowMatch(candidate, anime);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best?.href) {
    throw new Error("No suitable AnimeSalt title match found.");
  }

  return best;
}

function parseEpisodeLabel(episodeUrl, fallbackIndex) {
  const slug = String(episodeUrl || "").replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
  const match = slug.match(/-(\d+)x(\d+)$/i);
  if (!match) {
    return {
      number: fallbackIndex + 1,
      title: `Episode ${fallbackIndex + 1}`,
    };
  }

  const season = Number(match[1]);
  const episode = Number(match[2]);
  return {
    number: fallbackIndex + 1,
    title: `S${season}E${episode}`,
  };
}

function extractEpisodeEntries(html) {
  const entries = [];
  const articlePattern =
    /<article[^>]+class="post dfx fcl episodes[\s\S]*?<a href="([^"]*\/episode\/[^"]+\/)" class="lnk-blk"><\/a>/gi;

  for (const match of html.matchAll(articlePattern)) {
    const episodeUrl = String(match[1] || "").trim();
    if (!episodeUrl) continue;
    entries.push(episodeUrl);
  }

  if (entries.length) return uniqueStrings(entries);

  const smartPattern = /<a href="([^"]*\/episode\/[^"]+\/)" class="smart-play-btn[^"]*">/gi;
  for (const match of html.matchAll(smartPattern)) {
    const episodeUrl = String(match[1] || "").trim();
    if (!episodeUrl) continue;
    entries.push(episodeUrl);
  }

  return uniqueStrings(entries);
}

function pickLanguageOption(languages, requestedLanguage) {
  const list = uniqueStrings(languages);
  const requested = String(requestedLanguage || "").trim().toLowerCase();
  if (requested && list.includes(requested)) return requested;

  for (const preferred of LANGUAGE_PRIORITY) {
    if (list.includes(preferred)) return preferred;
  }

  return list[0] || "hindi";
}

function buildSourceMeta(entry) {
  return {
    languages: entry.languages.map((slug) => LANGUAGE_MAP[slug]?.label || titleCaseLabel(slug)),
    platforms: entry.platforms.map(mapPlatformLabel),
    statuses: entry.statuses.map(mapStatusLabel),
    kind: entry.kind === "movie" ? "Movie" : "Series",
  };
}

function parseEpisodeId(episodeId) {
  const [prefix, seriesSlug, episodeSlug, language, episodeNumber] = String(episodeId || "").split("|");
  if (prefix !== "animesalt" || !seriesSlug || !episodeSlug || !language) return null;

  const parsedNumber = Number(episodeNumber);
  return {
    seriesSlug,
    episodeSlug,
    language,
    episodeNumber: Number.isFinite(parsedNumber) ? parsedNumber : null,
  };
}

function getLanguageCode(language) {
  const key = String(language || "").trim().toLowerCase();
  return LANGUAGE_MAP[key]?.code || "hin";
}

function getLanguageLabel(language) {
  const key = String(language || "").trim().toLowerCase();
  return LANGUAGE_MAP[key]?.label || titleCaseLabel(key);
}

function extractPrimaryEmbedUrl(html) {
  const iframeMatch = String(html).match(/<iframe[^>]+(?:src|data-src)="([^"]+)"[^>]*><\/iframe>/i);
  const rawUrl = String(iframeMatch?.[1] || "").trim();
  const embedUrl = rawUrl
    ? rawUrl.startsWith("http")
      ? rawUrl
      : `${BASE_URL}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`
    : "";

  if (!embedUrl) {
    throw new Error("AnimeSalt embed player was not found for this episode.");
  }
  return embedUrl;
}

function buildDirectMovieEpisode(show, activeTranslation) {
  return {
    id: `animesalt|${show.id}|__direct__|${activeTranslation}|1`,
    number: 1,
    title: show.kind === "movie" ? "Movie" : "Play",
  };
}

module.exports = {
  name: "animesalt",

  async search(query, options = {}) {
    const html = await fetchHtml(`${BASE_URL}/?s=${encodeURIComponent(query)}`);
    return extractSearchResults(html)
      .filter((entry) => matchesFilters(entry, options))
      .map(mapEntryToAnime);
  },

  async browse(options = {}) {
    return browseAnimeSalt(options);
  },

  async getDiscover() {
    const settled = await Promise.allSettled(
      DISCOVER_SECTION_PRESETS.map(async (preset) => ({
        id: preset.id,
        title: preset.title,
        language: preset.language || "",
        platform: preset.platform || "",
        items: await browseAnimeSalt({ language: preset.language, platform: preset.platform }),
      })),
    );

    return {
      filters: getBrowseFilters(),
      sections: settled
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value)
        .filter((section) => Array.isArray(section.items) && section.items.length),
    };
  },

  async getAnimeById(animeId) {
    const cleanId = cleanSourcePath(animeId);
    const html = await fetchHtml(`${BASE_URL}/${cleanId}/`);
    return extractAnimeFromPage(cleanId, html);
  },

  async getEpisodes(anime, options = {}) {
    const show = await resolveShow(anime);
    const html = await fetchHtml(show.href);
    const episodeUrls = extractEpisodeEntries(html);
    const translationOptions = uniqueStrings(show.languages);
    const activeTranslation = pickLanguageOption(translationOptions, options.translationType);

    if (!episodeUrls.length) {
      if (show.kind === "movie") {
        return {
          translationOptions,
          activeTranslation,
          optionLabel: "Audio Language",
          sourceMeta: buildSourceMeta(show),
          episodes: [buildDirectMovieEpisode(show, activeTranslation)],
        };
      }
      throw new Error("AnimeSalt episode list was empty for this title.");
    }

    return {
      translationOptions,
      activeTranslation,
      optionLabel: "Audio Language",
      sourceMeta: buildSourceMeta(show),
      episodes: episodeUrls.map((episodeUrl, index) => {
        const episodeSlug = episodeUrl.replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
        const label = parseEpisodeLabel(episodeUrl, index);
        return {
          id: `animesalt|${show.id}|${episodeSlug}|${activeTranslation}|${label.number || index + 1}`,
          number: label.number || index + 1,
          title: label.title,
        };
      }),
    };
  },

  async getStream(_anime, episodeId) {
    const parsed = parseEpisodeId(episodeId);
    if (!parsed) {
      throw new Error("Invalid AnimeSalt episode id.");
    }

    const episodeUrl =
      parsed.episodeSlug === "__direct__"
        ? `${BASE_URL}/${cleanSourcePath(parsed.seriesSlug)}/`
        : `${BASE_URL}/episode/${parsed.episodeSlug}/`;
    const html = await fetchHtml(episodeUrl);
    const embedUrl = extractPrimaryEmbedUrl(html);

    return {
      type: "embed",
      url: embedUrl,
      embedOrigin: new URL(embedUrl).origin,
      audioLanguageCode: getLanguageCode(parsed.language),
      audioLanguageLabel: getLanguageLabel(parsed.language),
      subtitles: [],
      headers: {
        Referer: episodeUrl,
        Origin: BASE_URL,
      },
    };
  },
};
