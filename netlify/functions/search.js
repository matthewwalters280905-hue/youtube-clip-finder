const headers = {
  "Content-Type": "application/json; charset=utf-8"
};

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body)
  };
}

function parseDuration(isoDuration = "PT0S") {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatCount(value) {
  const number = Number(value || 0);
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

function scoreVideo(video, prompt) {
  const text = `${video.title} ${video.channelTitle} ${video.description}`.toLowerCase();
  const terms = prompt.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
  const termHits = terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
  const durationBonus = video.durationSeconds <= 240 ? 3 : video.durationSeconds <= 600 ? 1 : 0;
  const viewBonus = Math.min(Math.log10(Number(video.viewCount || 1)), 7) / 2;
  return Number((termHits * 2 + durationBonus + viewBonus).toFixed(2));
}

function assessRightsRisk(video) {
  const text = `${video.title} ${video.channelTitle} ${video.description}`.toLowerCase();
  const highRiskTerms = [
    "official music video",
    "music video",
    "vevo",
    "full episode",
    "movie clip",
    "trailer",
    "netflix",
    "disney",
    "warner",
    "universal pictures",
    "sony pictures",
    "nba",
    "nfl",
    "ufc",
    "premier league",
    "highlights"
  ];
  const mediumRiskTerms = [
    "reaction",
    "compilation",
    "podcast clips",
    "live performance",
    "cover",
    "remix",
    "interview"
  ];
  const highHits = highRiskTerms.filter((term) => text.includes(term));
  const mediumHits = mediumRiskTerms.filter((term) => text.includes(term));

  if (video.license === "creativeCommon") {
    return {
      level: "lower",
      label: "Lower risk",
      reasons: ["Listed as Creative Commons on YouTube"]
    };
  }

  if (highHits.length) {
    return {
      level: "higher",
      label: "Higher risk",
      reasons: highHits.slice(0, 3).map((term) => `Mentions ${term}`)
    };
  }

  if (mediumHits.length || video.license === "youtube") {
    return {
      level: "medium",
      label: "Check rights",
      reasons: mediumHits.length ? mediumHits.slice(0, 3).map((term) => `Mentions ${term}`) : ["Standard YouTube license"]
    };
  }

  return {
    level: "unknown",
    label: "Unknown",
    reasons: ["No clear rights signal in public metadata"]
  };
}

async function youtubeFetch(pathname, params, apiKey) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${pathname}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason = body?.error?.message || "YouTube request failed.";
    const error = new Error(reason);
    error.statusCode = response.status;
    throw error;
  }

  return body;
}

exports.handler = async (event) => {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return json(500, {
      error: "Missing YouTube API key. Add YOUTUBE_API_KEY in Netlify environment variables."
    });
  }

  const prompt = (event.queryStringParameters?.q || "").trim();
  const order = event.queryStringParameters?.order || "relevance";
  const duration = event.queryStringParameters?.duration || "short";
  const videoKind = event.queryStringParameters?.videoKind || "both";
  const maxResults = Math.min(Math.max(Number(event.queryStringParameters?.maxResults || 12), 1), 25);

  if (!prompt) {
    return json(400, { error: "Enter a prompt to search YouTube." });
  }

  try {
    const search = await youtubeFetch("search", {
      part: "snippet",
      q: prompt,
      type: "video",
      videoDuration: videoKind === "shorts" ? "short" : duration,
      videoEmbeddable: "true",
      safeSearch: "moderate",
      order,
      maxResults: videoKind === "both" ? maxResults : 25
    }, apiKey);

    const ids = (search.items || []).map((item) => item.id?.videoId).filter(Boolean);

    if (!ids.length) {
      return json(200, { items: [], nextPageToken: search.nextPageToken || null });
    }

    const details = await youtubeFetch("videos", {
      part: "snippet,contentDetails,statistics,status",
      id: ids.join(","),
      maxResults: ids.length
    }, apiKey);

    const items = (details.items || [])
      .map((item) => {
        const durationSeconds = parseDuration(item.contentDetails?.duration);
        const snippet = item.snippet || {};
        const stats = item.statistics || {};
        const status = item.status || {};
        const video = {
          id: item.id,
          title: snippet.title || "Untitled video",
          channelTitle: snippet.channelTitle || "Unknown channel",
          description: snippet.description || "",
          publishedAt: snippet.publishedAt || "",
          thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
          duration: formatDuration(durationSeconds),
          durationSeconds,
          videoKind: durationSeconds <= 60 ? "shorts" : "standard",
          viewCount: stats.viewCount || 0,
          likeCount: stats.likeCount || 0,
          license: status.license || "unknown",
          url: `https://www.youtube.com/watch?v=${item.id}`,
          shortsUrl: `https://www.youtube.com/shorts/${item.id}`,
          embedUrl: `https://www.youtube.com/embed/${item.id}`,
          score: 0
        };

        video.score = scoreVideo(video, prompt);
        video.viewsLabel = `${formatCount(video.viewCount)} views`;
        video.rightsRisk = assessRightsRisk(video);
        return video;
      })
      .filter((video) => {
        if (videoKind === "shorts") return video.durationSeconds <= 60;
        if (videoKind === "standard") return video.durationSeconds > 60;
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return json(200, { items, nextPageToken: search.nextPageToken || null });
  } catch (error) {
    return json(error.statusCode || 500, {
      error: error.message || "Something went wrong."
    });
  }
};
