#!/usr/bin/env node
/**
 * Writes admin/api/src/films.json, the list of films the admin API's Films card reports on, from
 * docs/films/*.md, read the way the site's build reads them (docs_lib.mjs `loadFilm`): the slug
 * from the file name, the title from its heading, the video id from `watch` (either the
 * youtube.com/watch?v= or the youtube.com/shorts/ form), `released` as the day it was
 * published and `runtime` (m:ss), which the retention curve's axis reads.
 *
 * The service is built from admin/api alone (`gcloud run deploy --source admin/api`), so it cannot
 * read docs/films itself; the list is committed beside its code and copied into the image with
 * src/. admin/api/test/films.test.mjs fails while the two disagree, so a new film is one run of:
 *
 *   node admin/tools/films-json.mjs           write the list
 *   node admin/tools/films-json.mjs --check   exit 1 if it is stale
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadFilm } from "../../.agents/skills/site-quality/scripts/docs_lib.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const FILMS_DIR = `${ROOT}docs/films`;
export const FILMS_JSON = `${ROOT}admin/api/src/films.json`;

/** The films in docs/films, newest first (the card's order): `[{ slug, title, videoId, published, runtime }]`. */
export function filmsFromDocs(dir = FILMS_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => loadFilm(name, readFileSync(`${dir}/${name}`, "utf8")))
    .map((f) => ({ slug: f.slug, title: f.title, videoId: f.videoId, published: f.released, runtime: f.runtime }))
    .sort((a, b) => b.published.localeCompare(a.published) || a.slug.localeCompare(b.slug));
}

/** The file's text: one film a line, so a diff shows the film that changed. */
export function filmsJsonText(films) {
  return `[\n${films.map((f) => `  ${JSON.stringify(f)}`).join(",\n")}\n]\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const text = filmsJsonText(filmsFromDocs());
  if (process.argv.includes("--check")) {
    const now = readFileSync(FILMS_JSON, "utf8");
    if (now !== text) {
      console.error("admin/api/src/films.json is stale: run node admin/tools/films-json.mjs");
      process.exit(1);
    }
    console.log("admin/api/src/films.json is current");
  } else {
    writeFileSync(FILMS_JSON, text);
    console.log(`wrote ${FILMS_JSON.slice(ROOT.length)}`);
  }
}
