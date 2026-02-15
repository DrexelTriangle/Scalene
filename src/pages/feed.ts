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
  let newFeed = feed.replaceAll("https://cms.thetriangle.org/wp-content", "https://thetriangle.org/proxy")
  newFeed = newFeed.replaceAll("https://cms.thetriangle.org", "https://thetriangle.org")

  return new Response(
    newFeed,
    { headers: { "Content-Type": "application/xml" } }
  );
};
