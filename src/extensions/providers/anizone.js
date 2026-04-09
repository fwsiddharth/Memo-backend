const BASE_URL = "https://anizone.to";
const CDN_BASE = "https://seiryuu.vid-cdn.xyz";
const path = require("path");
const fs = require("fs");

// Load ID mappings
let idMappings = {};
try {
  const mappingPath = path.join(__dirname, "anizone-mappings.json");
  const mappingData = fs.readFileSync(mappingPath, "utf8");
  const parsed = JSON.parse(mappingData);
  idMappings = parsed.mappings || {};
} catch (error) {
  // Mappings file not found or invalid, continue without it
}

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
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
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
  // Try multiple approaches to find anime
  const results = [];
  const seenIds = new Set();
  
  // Approach 1: Try the anime index page
  try {
    const html = await fetchHtml(`${BASE_URL}/anime`);
    const allAnime = extractAnimeFromHtml(html);
    
    const normalizedQuery = normalizeText(query);
    const filtered = allAnime.filter(anime => 
      normalizeText(anime.title).includes(normalizedQuery)
    );
    
    for (const anime of filtered) {
      if (!seenIds.has(anime.id)) {
        seenIds.add(anime.id);
        results.push(anime);
      }
    }
  } catch (error) {
    // Continue to next approach
  }
  
  // Approach 2: Try the episode index page (might have more recent anime)
  try {
    const html = await fetchHtml(`${BASE_URL}/episode`);
    const allAnime = extractAnimeFromHtml(html);
    
    const normalizedQuery = normalizeText(query);
    const filtered = allAnime.filter(anime => 
      normalizeText(anime.title).includes(normalizedQuery)
    );
    
    for (const anime of filtered) {
      if (!seenIds.has(anime.id)) {
        seenIds.add(anime.id);
        results.push(anime);
      }
    }
  } catch (error) {
    // Continue
  }
  
  return results;
}

async function resolveShow(anime) {
  if (anime?.provider === "anizone") {
    return {
      id: anime.id,
      title: anime.title,
      url: anime.url || `${BASE_URL}/anime/${anime.id}`,
    };
  }

  // Check if we have a manual mapping for this anime
  const anilistId = String(anime?.id || "");
  if (anilistId && idMappings[anilistId]) {
    const anizoneId = idMappings[anilistId];
    if (anizoneId !== "unknown") {
      return {
        id: anizoneId,
        title: anime.title || anime.titleEnglish || anime.titleRomaji || "Unknown",
        url: `${BASE_URL}/anime/${anizoneId}`,
      };
    }
  }

  // AniZone doesn't have a search API and uses unpredictable IDs
  throw new Error(
    "AniZone: This anime is not in the ID mapping. " +
    "To add it: 1) Find the anime on anizone.to, " +
    "2) Copy the ID from the URL (e.g., 'uyyyn4kf' from /anime/uyyyn4kf), " +
    "3) Add the mapping to backend/src/extensions/providers/anizone-mappings.json. " +
    "Alternatively, use one of the other sources (AnimeSalt, Gojo, kickAss, Kaido)."
  );
}

async function getAnimeEpisodes(animeId) {
  const html = await fetchHtml(`${BASE_URL}/anime/${animeId}`);
  
  // Extract total episode count from the page
  const episodeCountMatch = html.match(/(\d+)\s+Episodes/i);
  if (episodeCountMatch) {
    const totalEpisodes = parseInt(episodeCountMatch[1]);
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

    const html = await fetchHtml(`${BASE_URL}/anime/${parsed.animeId}/${parsed.episodeNumber}`);
    const videoId = extractVideoId(html);

    if (!videoId) {
      throw new Error("Failed to extract video ID from AniZone episode page.");
    }

    const streamUrl = `${CDN_BASE}/${videoId}/master.m3u8`;

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
