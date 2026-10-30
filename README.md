# My Website

A hand-built site using plain HTML, CSS and JS.

## Preview locally

    python3 -m http.server

Then open http://localhost:8000.

## Deploy on GitHub Pages

1. `git init`, commit, and push to a new GitHub repo on `main`.
2. In the repo: Settings → Pages → deploy from branch `main`, folder `/ (root)`.
3. Name the repo `<username>.github.io` for a root URL, otherwise the site lives at `<username>.github.io/<repo>/`.

## Notes

- `index.html` is the site. The Hobbies wafer is `js/wafer.js` (WebGL2, two screens tall).
- `wafer.html` is an older single-screen standalone preview of the wafer. Open it directly in a browser; it is not kept in sync with `js/wafer.js`, so make wafer changes in `js/wafer.js`.
- Local `css/` and `js/` links carry a `?v=` number; bump it when you change those files so browsers pick up the new copy.
