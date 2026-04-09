function mapKitsuAnime(item) {
  const attrs = item?.attributes || {};
  return {
    id: String(item?.id || ""),
    provider: "kitsu",
    title: attrs.titles?.en_jp || attrs.titles?.en || attrs.canonicalTitle || "Untitled",
    titleEnglish: attrs.titles?.en || attrs.canonicalTitle || null,
    titleRomaji: attrs.titles?.en_jp || attrs.canonicalTitle || null,
    description: attrs.synopsis || "",
    episodes: attrs.episodeCount || null,
    status: attrs.status || null,
    format: attrs.subtype || null,
    seasonYear: attrs.startDate ? Number(String(attrs.startDate).slice(0, 4)) : null,
    genres: [],
    coverImage: attrs.posterImage?.large || attrs.posterImage?.small || null,
    bannerImage: attrs.coverImage?.large || attrs.coverImage?.small || null,
    averageScore: attrs.averageRating ? Number(attrs.averageRating) : null,
    popularity: attrs.popularityRank || null,
    source: "kitsu",
  };
}

async function kitsuRequest(path) {
  const response = await fetch(`https://kitsu.io/api/edge${path}`, {
    headers: {
      Accept: "application/vnd.api+json",
    },
  });
  if (!response.ok) {
    throw new Error(`Kitsu HTTP ${response.status}`);
  }
  return response.json();
}

async function getHomeFeedsFallback() {
  const [trendingRaw, popularRaw, recentRaw] = await Promise.all([
    kitsuRequest("/trending/anime"),
    kitsuRequest("/anime?page[limit]=18&sort=-popularityRank"),
    kitsuRequest("/anime?page[limit]=18&sort=-updatedAt"),
  ]);

  return {
    trending: (trendingRaw.data || []).map(mapKitsuAnime),
    popular: (popularRaw.data || []).map(mapKitsuAnime),
    recent: (recentRaw.data || []).map(mapKitsuAnime),
    topRated: (popularRaw.data || []).map(mapKitsuAnime),
    airing: (trendingRaw.data || []).map(mapKitsuAnime),
    upcoming: [],
    latestEpisodes: (recentRaw.data || []).map(mapKitsuAnime),
    latestCompleted: [],
  };
}

async function searchAnimeFallback(search) {
  const raw = await kitsuRequest(
    `/anime?page[limit]=24&filter[text]=${encodeURIComponent(search)}`,
  );
  return (raw.data || []).map(mapKitsuAnime);
}

async function getAnimeByIdFallback(animeId) {
  const raw = await kitsuRequest(`/anime/${encodeURIComponent(animeId)}`);
  return mapKitsuAnime(raw?.data);
}

module.exports = {
  getHomeFeedsFallback,
  searchAnimeFallback,
  getAnimeByIdFallback,
};
