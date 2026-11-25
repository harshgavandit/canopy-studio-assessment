# Canopy Studio

A tent configurator built for the interactive product configurator assessment. Design the four roof faces and four valances independently, preview the supplied tent in 3D, and download a production proof. The demo includes three tent variants, frame and wall options, itemized quotes, a mock Shopify cart, and an iframe host page.

## Run locally

Requires Node.js 22.18 or later.

```sh
npm ci
npm run dev
npm test
npm run build
```

Open the URL shown by Vite. Navigate to `/embed-demo.html` to test the embedded experience.

To run the browser regression suite against the production build, run `npm run build`, `npx playwright install chromium`, and `npm run test:browser`. Set `CANOPY_BROWSER` to use an existing Chromium or Edge executable.

## Design

- **Configuration.** A versioned TypeScript record holds a variant, options, quantity, and a keyed collection of panels. Each panel owns its background and ordered text or image layers. Layer position and size use normalized coordinates, so window size and model changes preserve the design. Draft and cart records live in browser storage. Artwork is rasterized and stored in IndexedDB.
- **Rendering.** The 2D editor, Three.js canvas texture, and PDF share the same panel renderer. Each supplied model has eight outer fabric UV islands. The model adapter maps them to a second UV channel using world-space panel orientation, leaving the supplied normal and roughness maps on their original coordinates. The 3D viewer loads only the selected GLB and renders on demand. Wall and lighted-frame geometry is generated for the demo.
- **Commerce.** `POST /api/quote` validates the configuration and calculates variant, option, and decorated-panel pricing using integer cents. `POST /api/cart` recomputes and checks the quote, then returns an immutable design snapshot and Shopify-shaped lines. A real adapter would replace mock merchandise IDs with Shopify variant IDs, including priced add-ons. The order can look up the production proof using the configuration ID and proof filename in line attributes. Mock pricing and cart require no store credentials.
- **Production proof.** The downloadable PDF includes the variant, options, quantity, pricing, the 3D view when available, and a separate preview and artwork specification for each active panel. The cart and proof use the same configuration ID. For production, persist the snapshot, original artwork, and proof in server-side storage before handing off to Shopify.
- **Embedding.** Serve `/?embed=1&parent_origin=https%3A%2F%2Fexample.com` in an iframe. The app emits `ready`, `resize`, `saved`, and `cart` messages to the configured parent origin. Check both the sender origin and iframe window in the host. The included host page demonstrates the event contract.

The model names are used as variant labels. The supplied 6.5 ft file has essentially the same measured footprint as the 5 ft file. The reference storefront's 10 ft model was not supplied. See [the measured texture regions](assessment-uv-map.png).
