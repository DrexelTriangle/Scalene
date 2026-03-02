import type { APIRoute } from "astro";
export function removeTag(xml: string, tag: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const nodes = doc.getElementsByTagName(tag);
  [...Array.from(nodes)].forEach(n => n.remove());

  return new XMLSerializer().serializeToString(doc);
}


export const GET: APIRoute = async ({ params }) => {

  const res = await fetch(
    "https://cms.thetriangle.org/feed"
  );
  const feed = await res.text();

  // White space at the beginning will break the feed
  let newFeed = feed.trim();

  newFeed = newFeed.replaceAll("https://cms.thetriangle.org/wp-content", "https://thetriangle.org/proxy/wp-content")
  newFeed = newFeed.replaceAll("https://cms.thetriangle.org", "https://thetriangle.org")

  return new Response(
    newFeed,
    { headers: { "Content-Type": "application/xml" } }
  );
};
