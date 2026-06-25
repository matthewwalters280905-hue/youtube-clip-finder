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

function secondsToTimestamp(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function timestampToSeconds(timestamp) {
  const parts = timestamp.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function extractTimestampMoments(text, source, videoId) {
  const moments = [];
  const pattern = /(?:^|\s)(?:(\d{1,2}:)?\d{1,2}:\d{2})(?=\s|$|[.,!?)\]-])/g;
  const lines = String(text || "").split(/\r?\n/);

  lines.forEach((line) => {
    const matches = [...line.matchAll(pattern)];
    matches.forEach((match) => {
      const timestamp = match[0].trim();
      const seconds = timestampToSeconds(timestamp);
      const context = line.replace(timestamp, "").trim().replace(/^[-|:.\s]+/, "");
      moments.push({
        timestamp: secondsToTimestamp(seconds),
        seconds,
        source,
        note: context || "Timestamp mentioned",
        url: `https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`
      });
    });
  });

  return moments;
}

function scoreMoment(moment) {
  const text = moment.note.toLowerCase();
  const funnyTerms = ["funny", "laugh", "crying", "best part", "hilarious", "lol", "lmao", "joke", "reaction", "wild", "awkward", "caught", "rage", "insane"];
  const sourceBonus = moment.source === "comment" ? 2 : 1;
  const termBonus = funnyTerms.reduce((score, term) => score + (text.includes(term) ? 2 : 0), 0);
  const textBonus = Math.min(moment.note.length / 80, 2);
  return Number((sourceBonus + termBonus + textBonus).toFixed(2));
}

exports.handler = async (event) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const videoId = (event.queryStringParameters?.videoId || "").trim();

  if (!apiKey) {
    return json(500, {
      error: "Missing YouTube API key. Add YOUTUBE_API_KEY in Netlify environment variables."
    });
  }

  if (!/^[\w-]{11}$/.test(videoId)) {
    return json(400, { error: "Send a valid YouTube video ID." });
  }

  try {
    const details = await youtubeFetch("videos", {
      part: "snippet",
      id: videoId,
      maxResults: 1
    }, apiKey);

    const video = details.items?.[0];
    if (!video) return json(404, { error: "Video not found." });

    const description = video.snippet?.description || "";
    let moments = extractTimestampMoments(description, "description", videoId);
    let commentsUnavailable = false;

    try {
      const comments = await youtubeFetch("commentThreads", {
        part: "snippet",
        videoId,
        maxResults: 80,
        order: "relevance",
        textFormat: "plainText"
      }, apiKey);

      (comments.items || []).forEach((item) => {
        const text = item.snippet?.topLevelComment?.snippet?.textDisplay || "";
        moments.push(...extractTimestampMoments(text, "comment", videoId));
      });
    } catch {
      commentsUnavailable = true;
    }

    const seen = new Set();
    moments = moments
      .map((moment) => ({ ...moment, score: scoreMoment(moment) }))
      .filter((moment) => {
        const key = `${moment.seconds}-${moment.note.toLowerCase().slice(0, 40)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    return json(200, {
      title: video.snippet?.title || "Untitled video",
      moments,
      commentsUnavailable
    });
  } catch (error) {
    return json(error.statusCode || 500, {
      error: error.message || "Something went wrong."
    });
  }
};
