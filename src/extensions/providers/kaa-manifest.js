const BASE_URL = "https://kaa.lt";
const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const PREFERRED_SERVERS = ["VidStreaming", "CatStream", "Vidstream", "Cat"];
const FETCH_TIMEOUT_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'");
}

function resolveUrl(url, baseUrl = "") {
  if (!url) return null;
  let value = String(url).trim();
  value = value.replace(/^https:\/\/\/+/i, "https://");
  value = value.replace(/^http:\/\/\/+/i, "http://");
  if (value.startsWith("//")) return `https:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    if (baseUrl) return new URL(value, baseUrl).toString();
  } catch {
    // fall through
  }
  return `https://${value.replace(/^\/+/, "")}`;
}

function normalizeLangCode(lang) {
  const value = String(lang || "").toLowerCase().trim();
  if (!value) return "en";
  if (value === "eng") return "en";
  if (value === "jpn") return "ja";
  if (value === "spa") return "es";
  if (value === "por") return "pt";
  return value;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getAnimeNames(anime) {
  return Array.from(
    new Set(
      [
        anime?.titleEnglish,
        anime?.titleRomaji,
        anime?.titleNative,
        anime?.title,
        ...(Array.isArray(anime?.synonyms) ? anime.synonyms : []),
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function scoreNameMatch(candidate, target) {
  if (!candidate || !target) return 0;
  if (candidate === target) return 100;
  if (candidate.startsWith(target) || target.startsWith(candidate)) return 85;
  if (candidate.includes(target) || target.includes(candidate)) return 70;
  return 0;
}

function scoreShowMatch(show, anime) {
  const showNames = Array.from(
    new Set([show?.title, show?.title_en].map((v) => String(v || "").trim()).filter(Boolean)),
  ).map(normalizeText);
  const animeNames = getAnimeNames(anime).map(normalizeText);

  let best = 0;
  for (const showName of showNames) {
    for (const animeName of animeNames) {
      best = Math.max(best, scoreNameMatch(showName, animeName));
    }
  }

  const animeYear = Number(anime?.seasonYear || anime?.year);
  const showYear = Number(show?.year);
  if (Number.isFinite(animeYear) && Number.isFinite(showYear) && animeYear === showYear) {
    best += 6;
  }

  const animeEpisodes = Number(anime?.episodes);
  const showEpisodes = Number(show?.episode_count);
  if (Number.isFinite(animeEpisodes) && Number.isFinite(showEpisodes)) {
    if (animeEpisodes === showEpisodes) best += 4;
    else if (Math.abs(animeEpisodes - showEpisodes) <= 2) best += 2;
  }

  if ((show?.locales || []).includes("ja-JP")) best += 3;
  if ((show?.locales || []).includes("en-US")) best += 2;

  return best;
}

async function kaaFetch(url, options = {}, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
          ...options.headers,
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        if (RETRYABLE_STATUSES.has(response.status) && attempt < retries) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        throw new Error(`KAA HTTP ${response.status}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
    }
  }
  throw lastError || new Error(`Failed to fetch ${url}`);
}

async function kaaFetchJson(url, options = {}) {
  const res = await kaaFetch(url, options);
  return res.json();
}

async function searchKaa(query) {
  const res = await kaaFetchJson(`${BASE_URL}/api/fsearch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, page: 1 }),
  });
  return Array.isArray(res?.result) ? res.result : [];
}

async function resolveShow(anime) {
  const names = getAnimeNames(anime);
  const bySlug = new Map();
  const errors = [];

  for (const name of names) {
    if (name.length < 2) continue;
    try {
      const q = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
      if (q.length < 2) continue;

      const results = await searchKaa(q);
      for (const item of results) {
        if (!item?.slug || bySlug.has(item.slug)) continue;
        bySlug.set(item.slug, item);
      }
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }

  const candidates = Array.from(bySlug.values());
  if (!candidates.length) {
    throw new Error(errors[0] || "KAA show not found for this anime.");
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

  if (!best || !best.slug) {
    throw new Error("No suitable KAA show match found.");
  }

  return best;
}

function parseEpisodeId(episodeId) {
  const raw = String(episodeId || "");
  const split = raw.split("|");
  if (split.length === 3) {
    const [showSlug, episodeString, epSlug] = split;
    return { showSlug, episodeString, epSlug };
  }
  return null;
}

async function getAllEpisodes(showSlug, language) {
  const url = `${BASE_URL}/api/show/${showSlug}/episodes?ep=1&lang=${encodeURIComponent(language)}`;
  const firstData = await kaaFetchJson(`${url}&page=1`);

  const pages = Array.isArray(firstData?.pages) ? firstData.pages : [];
  const pageNumbers = pages
    .map((p) => Number(p?.number))
    .filter((n) => Number.isFinite(n) && n > 1);

  const all = Array.isArray(firstData?.result) ? [...firstData.result] : [];
  const rest = await Promise.all(
    pageNumbers.map(async (pageNo) => {
      try {
        const json = await kaaFetchJson(`${url}&page=${pageNo}`);
        return Array.isArray(json?.result) ? json.result : [];
      } catch {
        return [];
      }
    }),
  );

  for (const list of rest) all.push(...list);
  return all
    .filter((ep) => Number.isInteger(ep?.episode_number))
    .sort((a, b) => Number(a.episode_number) - Number(b.episode_number));
}

function extractStreamFromPlayerHtml(html, playerUrl) {
  const propsMatch = String(html).match(/<astro-island[^>]+props="([^"]+)"/i);
  if (!propsMatch) return { manifestUrl: null, subtitles: [] };

  const propsRaw = decodeHtmlEntities(propsMatch[1]);
  let props;
  try {
    props = JSON.parse(propsRaw);
  } catch {
    return { manifestUrl: null, subtitles: [] };
  }

  const manifestRaw = Array.isArray(props?.manifest) ? props.manifest[1] : props?.manifest;
  let manifestUrl = resolveUrl(manifestRaw, playerUrl);
  if (manifestUrl) manifestUrl = manifestUrl.replace("https:///", "https://");

  const subtitlesRaw = Array.isArray(props?.subtitles) ? props.subtitles[1] : props?.subtitles;
  const subtitles = [];
  if (Array.isArray(subtitlesRaw)) {
    for (const entry of subtitlesRaw) {
      const item = Array.isArray(entry) ? entry[1] : entry;
      if (!item || typeof item !== "object") continue;

      const lang = Array.isArray(item.language) ? item.language[1] : item.language;
      const label = Array.isArray(item.name) ? item.name[1] : item.name;
      const srcRaw = Array.isArray(item.src) ? item.src[1] : item.src;
      
      let src = resolveUrl(srcRaw, playerUrl);
      if (!src) continue;

      src = src.replace("https:///", "https://");

      subtitles.push({
        lang: normalizeLangCode(lang),
        label: String(label || lang || "Subtitle"),
        url: src,
      });
    }
  }

  return { manifestUrl, subtitles };
}

module.exports = {
  name: "kaa-manifest", // Maintained name for backward compatibility in the DB

  async search(query) {
    const results = await searchKaa(query);
    return results.map((r) => ({
      id: r.slug,
      title: r.title_en || r.title,
      titleEnglish: r.title_en,
      titleRomaji: r.title,
      provider: "kaa",
      episodes: r.episode_count,
      seasonYear: r.year,
    }));
  },

  async getEpisodes(anime) {
    const show = await resolveShow(anime);

    let languages = [];
    try {
      const langJson = await kaaFetchJson(`${BASE_URL}/api/show/${show.slug}/language`);
      languages = langJson?.result || [];
    } catch {
      languages = ["ja-JP"];
    }

    let language = "ja-JP";
    if (languages.includes("ja-JP")) language = "ja-JP";
    else if (languages.includes("zh-CN")) language = "zh-CN";
    else if (languages.length > 0) language = languages[0];

    const episodes = await getAllEpisodes(show.slug, language);
    return {
      translationOptions: ["sub"],
      activeTranslation: "sub",
      episodes: episodes.map((ep) => {
        const episodeString = String(ep.episode_string || ep.episode_number);
        return {
          id: `${show.slug}|${episodeString}|${ep.slug}`,
          number: ep.episode_number,
          title: ep.title || `Episode ${episodeString}`,
        };
      }),
    };
  },

  async getStream(_anime, episodeId) {
    const parsed = parseEpisodeId(episodeId);
    if (!parsed) {
      throw new Error("Invalid KAA episode id.");
    }

    const { showSlug, episodeString, epSlug } = parsed;
    const epKey = `ep-${episodeString}-${epSlug}`;

    const epData = await kaaFetchJson(`${BASE_URL}/api/show/${showSlug}/episode/${epKey}`);
    const servers = Array.isArray(epData?.servers) ? epData.servers : [];

    const serversToTry = [];
    for (const pref of PREFERRED_SERVERS) {
      const match = servers.find((s) => String(s?.name || "").toLowerCase().trim() === pref.toLowerCase());
      if (match) serversToTry.push(match);
    }
    for (const s of servers) {
      if (!serversToTry.includes(s)) serversToTry.push(s);
    }

    if (!serversToTry.length) {
      throw new Error("No KAA server available for this episode.");
    }

    let lastError = null;

    for (const server of serversToTry) {
      if (!server?.src) continue;

      try {
        const playerUrl = String(server.src).replace("vast", "player");
        let playerOrigin = "";
        try {
          playerOrigin = new URL(playerUrl).origin;
        } catch {
          // ignore parsing error if source url is malformed
        }

        const playerRes = await kaaFetch(playerUrl, {
          headers: {
            Accept: "text/html,application/xhtml+xml,*/*",
            Referer: `${BASE_URL}/`,
            Origin: BASE_URL,
          },
        });

        const html = await playerRes.text();
        const { manifestUrl, subtitles } = extractStreamFromPlayerHtml(html, playerUrl);

        if (!manifestUrl) {
          lastError = new Error(`Stream manifest not found in ${server.name} player.`);
          continue;
        }

        return {
          type: "hls",
          url: manifestUrl,
          subtitles,
          headers: {
            Referer: playerUrl,
            Origin: playerOrigin || "https://krussdomi.com",
          },
          qualities: [{ label: "Auto", value: "auto" }],
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Failed to resolve stream from any KAA server.");
  },
};
