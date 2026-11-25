# Canopy Studio

A tent configurator built for the interactive product configurator assessment. Design the four roof faces, four valances, and any walls independently. Preview the supplied tent in 3D and download a production proof. The demo includes three tent variants. It also has the reference store's frame, side-wall, and half-wall selectors, itemized API quotes, a mock Shopify cart, and an iframe host page.

[Live configurator](https://canopy-studio-assessment.vercel.app) | [Iframe demo](https://canopy-studio-assessment.vercel.app/embed-demo.html)

## Run locally

Requires Node.js 22.18 or later.

```sh
npm ci
npm run dev
npm test
npm run build
```

Open the URL shown by Vite. Navigate to `/embed-demo.html` to test the embedded experience.

`npm test` runs the pricing, cart and schema-migration unit tests. To run the browser regression suite against the production build, run `npm run build`, `npx playwright install chromium`, and `npm run test:browser`. Set `CANOPY_BROWSER` to use an existing Chromium or Edge executable. Set `CANOPY_BASE_URL` to test a deployed instance. The suite covers 2D/3D sync, print boundaries, option pricing, PDF and cart exports, undo and keyboard editing, and the cross-origin iframe flow.

## Design

- **Configuration.** A versioned TypeScript record (`src/catalog.ts`) holds a variant, frame, side walls with their print sides, a half-wall set, quantity, and a keyed collection of panels. `parseConfiguration` validates it at every boundary and upgrades version 1 drafts. Each panel owns its background and ordered text or image layers. Layer position and size use normalized coordinates, so window size and model changes preserve the design. Draft and cart records live in browser storage and are validated when read back. Artwork is rasterized and stored in IndexedDB. Undo groups rapid repeats of an edit, such as typing or dragging a color picker, into one step.
- **Rendering.** The 2D editor, Three.js canvas texture, and PDF share the same panel renderer. Each supplied model has eight outer fabric UV islands. The model adapter maps them to a second UV channel using world-space panel orientation, leaving the supplied normal and roughness maps on their original coordinates. The 3D viewer loads only the selected GLB and renders on demand. The served models in `public/glb` are the supplied files with textures resized to 1024 px and converted to WebP (about 10.5 MB to 2.4 MB each): `npx @gltf-transform/cli resize <in> <tmp> --width 1024 --height 1024`, then `npx @gltf-transform/cli webp <tmp> <out>`. The originals stay in `Tent_glb (1)`. Wall and lighted-frame geometry is generated for the demo.
- **Commerce.** `POST /api/quote` validates the configuration and prices it from a mock price book (`server/service.ts`) in integer cents. Each quote line carries a SKU and unit count. `POST /api/cart` recomputes and checks the quote, then returns an immutable design snapshot and Storefront API `CartLineInput` lines. The canopy line carries readable options (size, frame, walls) and hidden `_configuration_id`, `_production_proof`, `_quote_id`, and `_quoted_total` properties. A real adapter would replace mock merchandise IDs with Shopify variant IDs, including priced add-ons. The order can look up the production proof using the configuration ID and proof filename in line attributes. Mock pricing and cart require no store credentials.
- **Production proof.** The downloadable PDF includes the variant, options, quantity, pricing, the 3D view when available, and a separate preview and artwork specification for each active panel. The cart and proof use the same configuration ID. For production, persist the snapshot, original artwork, and proof in server-side storage before handing off to Shopify.
- **Embedding.** Serve `/?embed=1&parent_origin=https%3A%2F%2Fexample.com` in an iframe. The app emits `ready`, `resize`, `saved`, `cart-open`, and `cart` messages to the configured parent origin. The `cart` message includes the Shopify lines, which a theme forwards to `cartLinesAdd` or `/cart/add.js`. Check both the sender origin and iframe window in the host. The included host page demonstrates the event contract.

The model names are used as variant labels. The supplied 6.5 ft file has essentially the same measured footprint as the 5 ft file. The reference storefront's 10 ft model was not supplied. As in the reference store, half walls (a side pair) combine with no or one full side wall but not with three. See [the measured texture regions](assessment-uv-map.png).
