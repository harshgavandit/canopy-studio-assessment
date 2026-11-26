# Canopy Studio

Design a custom canopy in 2D, check it in 3D, and download a PDF showing what to print. Choose from three tent sizes, change the frame and walls, and add text, images, and colors to individual panels.

[Sample production proof (PDF)](production-proof.pdf)

## Try the full flow

1. Pick a roof, valance (the fabric strip below the roof), or wall. Add text or upload a logo, then switch to **3D preview** to check its placement.
2. Open **Product options** to change the size, frame, walls, and quantity. Expand **Price breakdown** to see what each choice adds to the total.
3. Click **Add design to cart**, then **Production proof** in the cart. The PDF includes the selected options, itemized price, a 3D preview when available, and a separate artwork page for each panel.
4. Click **Open embed demo** to see the configurator inside a sample storefront. **Save & exit** notifies the storefront, and adding a design to the cart lets you inspect the order data it receives.

## Architecture and key technical decisions

The React and TypeScript app runs the editor, 3D preview, and PDF export in the browser. It sends the current design to a small server that handles quotes and cart requests. The sample storefront embeds the same app and receives the cart data when a customer adds a design.

| Area | What the project does |
| --- | --- |
| Code quality | The editor, drawing code, and pricing rules are separate. Saved designs and server requests go through the same design checks, so both use the same rules. |
| Saved designs | A design records the size, options, quantity, and the color and layers for each panel. Positions and widths are saved as percentages so artwork keeps its placement as the model or window size changes. Drafts, uploads, and the demo cart are saved in the browser. Older drafts are updated when opened. |
| 2D and 3D synchronization | The 2D editor, 3D preview, and PDF all draw from the same panel design and use the same drawing code. An edit to one panel appears on that panel in each view. |
| Pricing API | The app asks the server for an itemized quote. The server adds the tent, frame adjustments, walls, and a charge for each visible panel with text or artwork. It multiplies that price by the quantity. The estimate excludes tax and shipping. |
| Shopify integration | Adding to cart makes the server check the total again. The mock cart returns items in the format Shopify expects, with quantities, selected options, and a design ID. The same ID links the cart item to the PDF. A live Shopify setup would need real product IDs and server storage for artwork and proofs. |
| Performance | The browser loads the selected 3D model and redraws the scene when it changes. The optimized model files are about 2–2.5 MB each, down from roughly 10–11 MB. |
| Reuse and expansion | The product options and prices live separately from the editor. The drawing code and quote flow can be reused. A different product would need its own model, printable panels, and pricing rules. |

The demo uses the supplied 5 ft, 6.5 ft, and 8 ft model files. The 5 ft and 6.5 ft files have nearly the same measured footprint. Half walls can be combined with zero or one full wall. Choosing three full walls disables the half-wall set.

## Run locally

Requires Node.js 22.18 or later.

```sh
npm ci
npm run dev
```

Open the URL printed in the terminal. Add `/embed-demo.html` to open the sample storefront.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The checks cover pricing, cart validation, older draft formats, artwork placement, PDF downloads, and the iframe flow.

<details>
<summary>API and embed reference</summary>

- `POST /api/quote` takes the design and returns a line-by-line quote.
- `POST /api/cart` takes the design and quote ID. It checks the current price and returns the saved design, Shopify-shaped cart lines, and the PDF filename.
- Embed the app with `/?embed=1&parent_origin=https%3A%2F%2Fexample.com`. Replace the example origin with the storefront's origin. The iframe sends `ready`, `resize`, `saved`, `cart-open`, and `cart` events. The [sample host](public/embed-demo.html) shows how to check the sender and display the cart data.

</details>
