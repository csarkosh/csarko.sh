/**
 * The YouTube channel (`@csarkosh`), through the Data API with an API key:
 * public counts only. `channels.list` by handle gives the subscriber, view
 * and video totals and the uploads playlist; the playlist's items give the
 * video ids and `videos.list` their views and likes. Three units of the
 * 10,000 a day quota per load, cached five minutes.
 */

const API = "https://www.googleapis.com/youtube/v3";

export function createYouTube({ key, handle, fetch, cache, ttlMs = 300_000 }) {
  async function call(path, params) {
    const url = new URL(`${API}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("key", key);
    const res = await fetch(url.href, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`youtube ${res.status} on ${path}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return res.json();
  }

  return {
    get configured() {
      return typeof key === "string" && key !== "";
    },
    /** `{ subscribers, views, videos, videosList: [{ id, title, views, likes }] }` for the channel. */
    channel() {
      return cache.get(`youtube:${handle}`, ttlMs, async () => {
        const channels = await call("channels", { part: "statistics,contentDetails", forHandle: handle });
        const channel = channels.items?.[0];
        if (!channel) throw new Error(`youtube: no channel for handle ${handle}`);
        const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
        let videosList = [];
        if (uploads) {
          const items = await call("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: "50" });
          const ids = (items.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean);
          if (ids.length > 0) {
            const videos = await call("videos", { part: "statistics,snippet", id: ids.join(",") });
            videosList = videosOf(videos);
          }
        }
        return { ...statsOf(channel), videosList };
      });
    },
  };
}

/* ---- pure mappings ---- */

const num = (v) => (v === undefined || v === null ? null : Number(v));

export function statsOf(channel) {
  const s = channel?.statistics ?? {};
  return { subscribers: num(s.subscriberCount), views: num(s.viewCount), videos: num(s.videoCount) };
}

export function videosOf(videos) {
  return (videos?.items ?? [])
    .map((v) => ({ id: v.id, title: v.snippet?.title ?? "", views: num(v.statistics?.viewCount) ?? 0, likes: num(v.statistics?.likeCount) ?? 0 }))
    .sort((a, b) => b.views - a.views);
}
