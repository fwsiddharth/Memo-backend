const BASE_URL = "https://kaido.to";

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

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    throw new Error(`Kaido HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (!response.ok) {
    throw new Error(`Kaido HTTP ${response.status}`);
  }

  return response.json();
}

function extractSearchResults(html) {
  const results = [];
  const seenIds = new Set();

  // Match film-name links which contain the anime info
  const linkPattern = /<h3[^>]+class="[^"]*film-name[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"?]+)[^"]*"[^>]+title="([^"]+)"/gi;
  
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const title = stripTags(match[2]);
    
    // Extract ID from href (e.g., /one-piece-100 -> one-piece-100)
    const id = href.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    // Try to find the image for this item by looking backwards in the HTML
    const beforeLink = html.substring(Math.max(0, match.index - 500), match.index);
    const imageMatch = beforeLink.match(/data-src="([^"]+)"/i) || beforeLink.match(/src="([^"]+)"/i);
    const image = imageMatch ? imageMatch[1] : "";

    results.push({
      id,
      title,
      href: href.startsWith("http") ? href : `${BASE_URL}${href}`,
      coverImage: image || null,
      provider: "kaido",
    });
  }

  return results;
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

async function resolveShow(anime) {
  if (anime?.provider === "kaido") {
    return {
      id: anime.id,
      title: anime.title,
      href: anime.href || `${BASE_URL}/${anime.id}`,
    };
  }

  const names = buildQueryVariants(...getAnimeNames(anime));
  const byId = new Map();
  const failures = [];

  for (const name of names) {
    if (name.length < 2) continue;
    try {
      const html = await fetchHtml(`${BASE_URL}/search?keyword=${encodeURIComponent(name)}`);
      for (const result of extractSearchResults(html)) {
        if (!result?.id || byId.has(result.id)) continue;
        byId.set(result.id, result);
      }
    } catch (error) {
      failures.push(error?.message || String(error));
    }
  }

  const candidates = Array.from(byId.values());
  if (!candidates.length) {
    throw new Error(failures[0] || "Kaido anime not found.");
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

  if (!best?.id) {
    throw new Error("No suitable Kaido match found.");
  }

  return best;
}

function parseEpisodeId(episodeId) {
  const [prefix, animeId, episodeDataId, language] = String(episodeId || "").split("|");
  if (prefix !== "kaido" || !animeId || !episodeDataId || !language) return null;

  return {
    animeId,
    episodeDataId,
    language,
  };
}

module.exports = {
  name: "kaido",

  async search(query) {
    const html = await fetchHtml(`${BASE_URL}/search?keyword=${encodeURIComponent(query)}`);
    return extractSearchResults(html).map((result) => ({
      id: result.id,
      title: result.title,
      titleEnglish: result.title,
      titleRomaji: result.title,
      coverImage: result.coverImage,
      provider: "kaido",
    }));
  },

  async getEpisodes(anime, options = {}) {
    const show = await resolveShow(anime);
    
    // Extract anime ID from the show (e.g., "naruto-677" -> "677")
    const animeIdMatch = show.id.match(/-(\d+)$/);
    if (!animeIdMatch) {
      throw new Error("Could not extract Kaido anime ID.");
    }
    const animeId = animeIdMatch[1];

    // Fetch episode list from AJAX endpoint
    const episodeData = await fetchJson(`${BASE_URL}/ajax/episode/list/${animeId}`);
    
    if (!episodeData?.html) {
      throw new Error("Kaido episode list unavailable.");
    }

    // Parse episode HTML from response
    const episodes = [];
    const episodePattern = /data-number="(\d+)"\s+data-id="(\d+)"/gi;
    
    let match;
    while ((match = episodePattern.exec(episodeData.html)) !== null) {
      const episodeNumber = Number(match[1]);
      const episodeDataId = match[2];

      episodes.push({
        episodeDataId,
        number: episodeNumber,
        title: `Episode ${episodeNumber}`,
      });
    }

    if (!episodes.length) {
      throw new Error("No episodes found for this anime.");
    }

    const requestedTranslation = String(options.translationType || "").trim().toLowerCase();
    const translationType = requestedTranslation === "dub" ? "dub" : "sub";

    return {
      translationOptions: ["sub", "dub"],
      activeTranslation: translationType,
      episodes: episodes.map((ep) => ({
        id: `kaido|${show.id}|${ep.episodeDataId}|${translationType}`,
        number: ep.number,
        title: translationType === "dub" ? `${ep.title} (DUB)` : ep.title,
      })),
    };
  },

  async getStream(_anime, episodeId) {
    const parsed = parseEpisodeId(episodeId);
    if (!parsed) {
      throw new Error("Invalid Kaido episode ID.");
    }

    // Get available servers for the episode
    const serversData = await fetchJson(
      `${BASE_URL}/ajax/episode/servers?episodeId=${parsed.episodeDataId}`,
    );

    if (!serversData?.html) {
      throw new Error("Kaido servers unavailable.");
    }

    // Extract server IDs from the HTML response
    const serverPattern = /data-type="(sub|dub)"[^>]+data-id="(\d+)"|data-id="(\d+)"[^>]+data-type="(sub|dub)"/gi;
    const servers = [];
    
    let match;
    while ((match = serverPattern.exec(serversData.html)) !== null) {
      // Handle both attribute orders
      const serverType = match[1] || match[4];
      const serverId = match[2] || match[3];
      
      if (serverType === parsed.language) {
        servers.push(serverId);
      }
    }

    if (!servers.length) {
      throw new Error(`No ${parsed.language} servers available for this episode.`);
    }

    // Try each server until we get a working stream
    const failures = [];
    for (const serverId of servers) {
      try {
        const sourceData = await fetchJson(`${BASE_URL}/ajax/episode/sources?id=${serverId}`);
        
        if (!sourceData?.link) {
          failures.push(`Server ${serverId}: No source link`);
          continue;
        }

        // Check if it's a rapid-cloud/megacloud link
        if (sourceData.link.includes('rapid-cloud.co') || 
            sourceData.link.includes('rabbitstream') || 
            sourceData.link.includes('megacloud') ||
            sourceData.link.includes('mega-cloud')) {
          // Try to extract the actual video URL from MegaCloud/RapidCloud
          try {
            const embedUrl = sourceData.link;
            // Extract embed ID - handle different URL formats
            const embedIdMatch = embedUrl.match(/\/e(?:-\d+)?\/([^?]+)/);
            
            if (embedIdMatch) {
              const embedId = embedIdMatch[1];
              
              // Try MegaCloud API endpoints (they use different paths)
              const apiEndpoints = [
                `https://megacloud.tv/embed-2/ajax/e-1/getSources?id=${embedId}`,
                `https://rapid-cloud.co/ajax/embed-6-v2/getSources?id=${embedId}`,
                `https://rapid-cloud.co/ajax/embed-6/getSources?id=${embedId}`,
              ];
              
              for (const apiUrl of apiEndpoints) {
                try {
                  const sourcesResponse = await fetch(apiUrl, {
                    headers: {
                      'X-Requested-With': 'XMLHttpRequest',
                      'Referer': embedUrl,
                      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    },
                  });
                  
                  if (sourcesResponse.ok) {
                    const sourcesData = await sourcesResponse.json();
                    
                    // Check if sources are encrypted
                    if (sourcesData?.sources && typeof sourcesData.sources === 'string') {
                      // Sources are encrypted - need to decrypt
                      // For now, fall back to embed
                      console.log('MegaCloud sources are encrypted, falling back to embed');
                      break;
                    }
                    
                    if (sourcesData?.sources?.[0]?.file) {
                      // Got the actual m3u8 URL!
                      return {
                        type: "hls",
                        url: sourcesData.sources[0].file,
                        subtitles: (sourcesData.tracks || [])
                          .filter(track => track.kind === 'captions')
                          .map(track => ({
                            lang: track.label || 'English',
                            label: track.label || 'English',
                            url: track.file,
                          })),
                        headers: {
                          Referer: embedUrl,
                          Origin: new URL(embedUrl).origin,
                        },
                      };
                    }
                  }
                } catch (apiError) {
                  // Try next endpoint
                  continue;
                }
              }
            }
          } catch (extractError) {
            console.log('Failed to extract MegaCloud video:', extractError.message);
            // Fall back to embed
          }
        }

        // Fallback to embed if extraction failed
        return {
          type: "embed",
          url: sourceData.link,
          embedOrigin: new URL(sourceData.link).origin,
          subtitles: [],
          headers: {
            Referer: `${BASE_URL}/watch/${parsed.animeId}?ep=${parsed.episodeDataId}`,
            Origin: BASE_URL,
          },
        };
      } catch (error) {
        failures.push(`Server ${serverId}: ${error.message}`);
      }
    }

    throw new Error(failures[0] || "Failed to resolve Kaido stream.");
  },
};
