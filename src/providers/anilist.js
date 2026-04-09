const ANILIST_API = "https://graphql.anilist.co";
const MEDIA_CARD_FIELDS = `
  id
  idMal
  title { romaji english native }
  description(asHtml: false)
  episodes
  status
  format
  seasonYear
  genres
  coverImage { large extraLarge }
  bannerImage
  averageScore
  popularity
  nextAiringEpisode { episode airingAt }
  synonyms
`;

function getSeasonInfo(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();

  if (month <= 3) return { season: "WINTER", year, nextSeason: "SPRING", nextYear: year };
  if (month <= 6) return { season: "SPRING", year, nextSeason: "SUMMER", nextYear: year };
  if (month <= 9) return { season: "SUMMER", year, nextSeason: "FALL", nextYear: year };
  return { season: "FALL", year, nextSeason: "WINTER", nextYear: year + 1 };
}

async function queryAniList(query, variables = {}) {
  const response = await fetch(ANILIST_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`AniList HTTP ${response.status}`);
  }

  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message || "AniList error");
  }

  return json.data;
}

function mapMedia(media) {
  if (!media) return null;
  return {
    id: String(media.id),
    idMal: media.idMal || null,
    provider: "anilist",
    title: media.title?.english || media.title?.romaji || media.title?.native || "Untitled",
    titleEnglish: media.title?.english || null,
    titleRomaji: media.title?.romaji || null,
    titleNative: media.title?.native || null,
    description: media.description || "",
    episodes: media.episodes || null,
    status: media.status || null,
    format: media.format || null,
    seasonYear: media.seasonYear || null,
    genres: media.genres || [],
    coverImage: media.coverImage?.extraLarge || media.coverImage?.large || null,
    bannerImage: media.bannerImage || null,
    averageScore: media.averageScore || null,
    popularity: media.popularity || null,
    nextAiringEpisode: media.nextAiringEpisode || null,
    synonyms: Array.isArray(media.synonyms) ? media.synonyms : [],
  };
}

async function getHomeFeeds() {
  const season = getSeasonInfo();
  const query = `
    query HomeFeeds($nextSeason: MediaSeason, $nextYear: Int) {
      trending: Page(page: 1, perPage: 18) {
        media(sort: TRENDING_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_CARD_FIELDS}
        }
      }
      popular: Page(page: 1, perPage: 18) {
        media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_CARD_FIELDS}
        }
      }
      recent: Page(page: 1, perPage: 18) {
        media(sort: UPDATED_AT_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_CARD_FIELDS}
        }
      }
      topRated: Page(page: 1, perPage: 18) {
        media(sort: SCORE_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_CARD_FIELDS}
        }
      }
      airing: Page(page: 1, perPage: 18) {
        media(sort: POPULARITY_DESC, type: ANIME, isAdult: false, status: RELEASING) {
          ${MEDIA_CARD_FIELDS}
        }
      }
      upcoming: Page(page: 1, perPage: 18) {
        media(
          sort: POPULARITY_DESC
          type: ANIME
          isAdult: false
          status: NOT_YET_RELEASED
          season: $nextSeason
          seasonYear: $nextYear
        ) {
          ${MEDIA_CARD_FIELDS}
        }
      }
      latestEpisodes: Page(page: 1, perPage: 18) {
        media(sort: UPDATED_AT_DESC, type: ANIME, isAdult: false, status: RELEASING) {
          ${MEDIA_CARD_FIELDS}
        }
      }
      latestCompleted: Page(page: 1, perPage: 18) {
        media(sort: END_DATE_DESC, type: ANIME, isAdult: false, status: FINISHED) {
          ${MEDIA_CARD_FIELDS}
        }
      }
    }
  `;

  const data = await queryAniList(query, {
    nextSeason: season.nextSeason,
    nextYear: season.nextYear,
  });
  return {
    trending: (data.trending?.media || []).map(mapMedia),
    popular: (data.popular?.media || []).map(mapMedia),
    recent: (data.recent?.media || []).map(mapMedia),
    topRated: (data.topRated?.media || []).map(mapMedia),
    airing: (data.airing?.media || []).map(mapMedia),
    upcoming: (data.upcoming?.media || []).map(mapMedia),
    latestEpisodes: (data.latestEpisodes?.media || []).map(mapMedia),
    latestCompleted: (data.latestCompleted?.media || []).map(mapMedia),
  };
}

async function getSpotlightFeeds() {
  const season = getSeasonInfo();
  const query = `
    query SpotlightFeeds($currentSeason: MediaSeason, $currentYear: Int) {
      spotlight: Page(page: 1, perPage: 5) {
        media(
          sort: TRENDING_DESC
          type: ANIME
          isAdult: false
          season: $currentSeason
          seasonYear: $currentYear
        ) {
          ${MEDIA_CARD_FIELDS}
        }
      }
      popularSeason: Page(page: 1, perPage: 10) {
        media(
          sort: POPULARITY_DESC
          type: ANIME
          isAdult: false
          season: $currentSeason
          seasonYear: $currentYear
        ) {
          ${MEDIA_CARD_FIELDS}
        }
      }
    }
  `;

  const data = await queryAniList(query, {
    currentSeason: season.season,
    currentYear: season.year,
  });

  return {
    spotlight: (data.spotlight?.media || []).map(mapMedia),
    popularSeason: (data.popularSeason?.media || []).map(mapMedia),
  };
}

async function searchAnime(search) {
  const query = `
    query SearchAnime($search: String!) {
      Page(page: 1, perPage: 24) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
          id
          title { romaji english native }
          description(asHtml: false)
          episodes
          status
          format
          seasonYear
          genres
          coverImage { large extraLarge }
          bannerImage
          averageScore
          popularity
        }
      }
    }
  `;

  const data = await queryAniList(query, { search });
  return (data.Page?.media || []).map(mapMedia);
}

async function getAnimeById(animeId) {
  const query = `
    query AnimeById($id: Int!) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        title { romaji english native }
        description(asHtml: false)
        episodes
        status
        format
        seasonYear
        genres
        coverImage { large extraLarge }
        bannerImage
        averageScore
        popularity
        nextAiringEpisode { episode airingAt }
        synonyms
      }
    }
  `;

  const data = await queryAniList(query, { id: Number(animeId) });
  return mapMedia(data.Media);
}

module.exports = {
  getHomeFeeds,
  getSpotlightFeeds,
  searchAnime,
  getAnimeById,
};
