const BASE_URL = "https://anizone.to";
const CDN_BASE = "https://seiryuu.vid-cdn.xyz";

function normalizeText(value) {
  return String(value || "")
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

function scoreShowMatch(entry, anime) {
  const entryName = normalizeText(entry?.title);
  const animeNames = getAnimeNames(anime).map(normalizeText);

  let best = 0;
  for (const animeName of animeNames) {
    best = Math.max(best, scoreNameMatch(entryName, animeName));
  }

  return best;
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
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"macOS"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`AniZone HTTP ${response.status}`);
  }

  return response.text();
}

function extractAnimeFromHtml(html) {
  const results = [];
  const seenIds = new Set();

  // Pattern to match anime links
  const linkPattern = /href="\/anime\/([a-z0-9]+)"[^>]*>([^<]+)<\/a>/gi;
  
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const id = match[1];
    const title = match[2].trim();
    
    // Filter out navigation/UI elements
    if (id.length < 6 || seenIds.has(id)) continue;
    if (title.length < 2 || /^(Home|Anime|Episode|Tag|Settings)$/i.test(title)) continue;
    
    seenIds.add(id);
    results.push({
      id,
      title,
      url: `${BASE_URL}/anime/${id}`,
    });
  }

  return results;
}

async function searchAniZone(query) {
  console.log('[AniZone] Searching for:', query);
  
  // Try multiple approaches to find anime
  const results = [];
  const seenIds = new Set();
  
  // Approach 1: Try the anime index page
  try {
    console.log('[AniZone] Fetching anime index page...');
    const html = await fetchHtml(`${BASE_URL}/anime`);
    const allAnime = extractAnimeFromHtml(html);
    console.log('[AniZone] Found', allAnime.length, 'anime in index');
    
    const normalizedQuery = normalizeText(query);
    const filtered = allAnime.filter(anime => 
      normalizeText(anime.title).includes(normalizedQuery)
    );
    console.log('[AniZone] Filtered to', filtered.length, 'matches');
    
    for (const anime of filtered) {
      if (!seenIds.has(anime.id)) {
        seenIds.add(anime.id);
        results.push(anime);
      }
    }
  } catch (error) {
    console.error('[AniZone] Error fetching anime index:', error.message);
  }
  
  // Approach 2: Try the episode index page (might have more recent anime)
  try {
    console.log('[AniZone] Fetching episode index page...');
    const html = await fetchHtml(`${BASE_URL}/episode`);
    const allAnime = extractAnimeFromHtml(html);
    console.log('[AniZone] Found', allAnime.length, 'anime in episode index');
    
    const normalizedQuery = normalizeText(query);
    const filtered = allAnime.filter(anime => 
      normalizeText(anime.title).includes(normalizedQuery)
    );
    console.log('[AniZone] Filtered to', filtered.length, 'additional matches');
    
    for (const anime of filtered) {
      if (!seenIds.has(anime.id)) {
        seenIds.add(anime.id);
        results.push(anime);
      }
    }
  } catch (error) {
    console.error('[AniZone] Error fetching episode index:', error.message);
  }
  
  console.log('[AniZone] Total search results:', results.length);
  return results;
}

async function resolveShow(anime) {
  console.log('[AniZone] Resolving show for:', anime.title || anime.titleEnglish);
  
  if (anime?.provider === "anizone") {
    console.log('[AniZone] Anime is already from anizone, using ID:', anime.id);
    return {
      id: anime.id,
      title: anime.title,
      url: anime.url || `${BASE_URL}/anime/${anime.id}`,
    };
  }

  // Try automatic search and matching
  const names = buildQueryVariants(...getAnimeNames(anime));
  console.log('[AniZone] Search variants:', names);
  
  const byId = new Map();
  const failures = [];

  for (const name of names) {
    if (name.length < 2) continue;
    try {
      const results = await searchAniZone(name);
      for (const result of results) {
        if (!result?.id || byId.has(result.id)) continue;
        byId.set(result.id, result);
      }
    } catch (error) {
      failures.push(error?.message || String(error));
    }
  }

  const candidates = Array.from(byId.values());
  console.log('[AniZone] Found', candidates.length, 'candidates');
  
  if (!candidates.length) {
    throw new Error(
      failures[0] || "AniZone: Anime not found on anizone.to"
    );
  }

  // Find best match
  let best = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = scoreShowMatch(candidate, anime);
    console.log('[AniZone] Candidate:', candidate.title, 'Score:', score);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best?.id) {
    throw new Error("No suitable AniZone match found.");
  }

  console.log('[AniZone] Best match:', best.title, 'ID:', best.id, 'Score:', bestScore);
  return {
    id: best.id,
    title: best.title,
    url: best.url,
  };
}

async function getAnimeEpisodes(animeId) {
  console.log('[AniZone] Fetching episodes for anime ID:', animeId);
  const html = await fetchHtml(`${BASE_URL}/anime/${animeId}`);
  
  // Extract total episode count from the page
  const episodeCountMatch = html.match(/(\d+)\s+Episodes/i);
  if (episodeCountMatch) {
    const totalEpisodes = parseInt(episodeCountMatch[1]);
    console.log('[AniZone] Found', totalEpisodes, 'episodes');
    // Generate episode list from 1 to total
    return Array.from({ length: totalEpisodes }, (_, i) => i + 1);
  }
  
  // Fallback: Extract episode numbers from visible links
  const episodePattern = new RegExp(`/anime/${animeId}/(\\d+)`, "g");
  const episodes = new Set();
  let match;
  
  while ((match = episodePattern.exec(html)) !== null) {
    const episodeNum = parseInt(match[1]);
    if (episodeNum > 0) {
      episodes.add(episodeNum);
    }
  }
  
  if (episodes.size > 0) {
    console.log('[AniZone] Extracted', episodes.size, 'episodes from links');
    return Array.from(episodes).sort((a, b) => a - b);
  }
  
  throw new Error("Could not determine episode count for this anime.");
}

function extractVideoId(html) {
  // Extract M3U8 URL which contains the video ID
  const m3u8Match = html.match(/(https:\/\/[^"'\s]+\.m3u8)/);
  if (!m3u8Match) return null;
  
  // Extract video ID from URL: https://seiryuu.vid-cdn.xyz/{video-id}/master.m3u8
  const videoIdMatch = m3u8Match[1].match(/\/([a-f0-9-]+)\//);
  return videoIdMatch ? videoIdMatch[1] : null;
}

function buildSubtitles(videoId) {
  // AniZone provides subtitles - based on actual track elements from the page
  const languages = [
    { lang: "es-419", label: "Spanish (Latin American) - Full [CR]", index: 0, ext: "ass" },
    { lang: "es-419", label: "Spanish (Latin American) - Full [SC]", index: 1, ext: "ass" },
    { lang: "en", label: "English - Signs/Songs", index: 2, ext: "ass" },
    { lang: "en", label: "English - Full Subtitles", index: 3, ext: "ass" },
  ];

  return languages.map(sub => ({
    lang: sub.lang,
    label: sub.label,
    url: `${CDN_BASE}/${videoId}/subtitles/${sub.index}_${sub.lang}.${sub.ext}`,
  }));
}

function parseEpisodeId(episodeId) {
  const [prefix, animeId, episodeNumber] = String(episodeId || "").split("|");
  if (prefix !== "anizone" || !animeId || !episodeNumber) return null;

  const parsedNumber = Number(episodeNumber);
  if (!Number.isFinite(parsedNumber)) return null;

  return {
    animeId,
    episodeNumber: parsedNumber,
  };
}

module.exports = {
  name: "anizone",
  disabled: true, // Disabled due to Cloudflare 403 protection

  async search(query) {
    const results = await searchAniZone(query);
    return results.map(result => ({
      id: result.id,
      title: result.title,
      titleEnglish: result.title,
      titleRomaji: result.title,
      coverImage: null,
      provider: "anizone",
    }));
  },

  async getEpisodes(anime, options = {}) {
    const show = await resolveShow(anime);
    const episodes = await getAnimeEpisodes(show.id);

    if (!episodes.length) {
      throw new Error("No episodes found for this anime.");
    }

    // AniZone doesn't have separate sub/dub, it's all in the audio tracks
    const requestedTranslation = String(options.translationType || "").trim().toLowerCase();
    const translationType = requestedTranslation === "dub" ? "dub" : "sub";

    return {
      translationOptions: ["sub", "dub"],
      activeTranslation: translationType,
      optionLabel: translationType === "dub" ? "Multi-Audio (Dub)" : "Multi-Audio (Sub)",
      episodes: episodes.map(num => ({
        id: `anizone|${show.id}|${num}`,
        number: num,
        title: `Episode ${num}`,
      })),
    };
  },

  async getStream(_anime, episodeId) {
    const parsed = parseEpisodeId(episodeId);
    if (!parsed) {
      throw new Error("Invalid AniZone episode ID.");
    }

    console.log('[AniZone] Getting stream for anime:', parsed.animeId, 'episode:', parsed.episodeNumber);
    const html = await fetchHtml(`${BASE_URL}/anime/${parsed.animeId}/${parsed.episodeNumber}`);
    const videoId = extractVideoId(html);

    if (!videoId) {
      throw new Error("Failed to extract video ID from AniZone episode page.");
    }

    console.log('[AniZone] Extracted video ID:', videoId);
    const streamUrl = `${CDN_BASE}/${videoId}/master.m3u8`;
    console.log('[AniZone] Stream URL:', streamUrl);

    return {
      type: "hls",
      url: streamUrl,
      subtitles: buildSubtitles(videoId),
      headers: {
        Referer: `${BASE_URL}/anime/${parsed.animeId}/${parsed.episodeNumber}`,
        Origin: BASE_URL,
      },
    };
  },
};
