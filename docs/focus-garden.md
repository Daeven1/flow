# Focus Garden

[Open a growing chicory on this Mac](http://127.0.0.1:43181/focus?sample=growing) or [start with the Focus task picker](http://127.0.0.1:43181/focus). The preview runs the real Focus page, timer, picker and Three.js garden against fictional records stored in the preview browser. The growing sample starts partway through a gentle session in a fresh preview profile. An existing session resumes on reload.

[Try the growth slider](http://127.0.0.1:43181/grove-lab) to compare plants and growth stages without starting a timer. It opens the existing development-only garden lab and uses no saved Focus session.

To start the private preview from this worktree with the project dependencies installed, run `node scripts/focus-garden-preview.cjs`. It listens on the Mac’s loopback interface. The URL works on this Mac while the launcher is running. Device emulation uses the same address. On an iPhone, use the temporary owner-restricted Tailscale link supplied privately while the Mac is awake. Its HTTP connection runs inside the encrypted tailnet. Safari requires a secure browser context for screen wake lock, so that API needs a separate HTTPS device check.

## Garden and growth

During a session the camera turns around the chosen plot. The phone view crops to the growing plant and keeps the timer and controls in reach. The wider layout gives the garden more room alongside the task controls. Setup and recap show the whole garden.

The new plants have 17 visual stages driven by the existing session clock. Chicory grows a rosette, angular branches, buds and blue flower heads. The native ferns begin as curled shoots and unfurl. Trees build their crowns over successive tending sessions. An existing plant keeps its stored species, spot, and permanent tree stage. The original four garden styles are still available. [Species and growth comparison](focus-garden-preview/species-and-growth.png)

## Species references

These are examples of documented Canadian ranges. The regional status for each species comes from the Database of Vascular Plants of Canada. The shapes are original, stylized drawings built from geometry.

| Plant | Examples of Canadian range | Visual identification and references |
| --- | --- | --- |
| Common chicory · *Cichorium intybus* | Introduced in British Columbia and Ontario | Branching stems carry blue flower heads composed of strap-shaped florets. [VASCAN](https://data.canadensys.net/vascan/taxon/2987) · [Illustrated Flora of British Columbia](https://linnet.geog.ubc.ca/Atlas/Atlas.aspx?sciname=Cichorium+intybus) |
| Fireweed · *Chamaenerion angustifolium* | Native in Yukon and British Columbia | Pink flowers open up a tall spike. [VASCAN](https://data.canadensys.net/vascan/taxon/17491) · [Government of Yukon](https://yukon.ca/en/find-out-about-yukon-symbols-emblems) |
| Canada columbine · *Aquilegia canadensis* | Native in Manitoba, Ontario and Quebec | Red, spurred flowers nod above the foliage and open to yellow centers. [VASCAN](https://data.canadensys.net/vascan/taxon/8444) · [Lady Bird Johnson Wildflower Center](https://www.wildflower.org/plants/result.php?id_plant=aqca) |
| Northern blue flag · *Iris versicolor* | Native in Ontario and Quebec | Upright sword-shaped leaves frame violet flowers with downward-curving outer segments. [VASCAN](https://data.canadensys.net/vascan/taxon/6188) · [Canadian Heritage](https://www.canada.ca/en/canadian-heritage/services/provincial-territorial-symbols-canada/quebec.html) |
| Ostrich fern · *Matteuccia pensylvanica* | Native in New Brunswick and Ontario | Fiddleheads open into a vase of green fronds. [VASCAN](https://data.canadensys.net/vascan/taxon/21998) · [New Brunswick species guide](https://speciesinfonb.ca/species/ostrich-fern-fiddleheads/) |
| Northern maidenhair fern · *Adiantum pedatum* | Native in Ontario and Quebec | Dark branching stalks hold delicate fans of leaflets. [VASCAN](https://data.canadensys.net/vascan/taxon/8382) · [Native Plant Trust](https://plantfinder.nativeplanttrust.org/plant/Adiantum-pedatum) |
| Paper birch · *Betula papyrifera* | Native in British Columbia and Ontario | A deciduous crown branches above a trunk that grows pale with age. [VASCAN](https://data.canadensys.net/vascan/taxon/3697) · [Illustrated Flora of British Columbia](https://linnet.geog.ubc.ca/Atlas/Atlas.aspx?sciname=Betula+papyrifera) |
| White spruce · *Picea glauca* | Native in British Columbia, Ontario and Quebec | An evergreen crown carries blue-green needles and slender hanging cones. [VASCAN](https://data.canadensys.net/vascan/taxon/7173) · [Natural Resources Canada](https://tidcf.nrcan.gc.ca/en/trees/factsheet/38) |

## Verification

Run `npm test` for the model, account, session, habitat and server-route suites. Run `node scripts/check-focus-garden.cjs --screenshots` against the local preview to exercise the real Focus components with fictional data and regenerate the [desktop](focus-garden-preview/desktop.png) and [phone](focus-garden-preview/phone.png) captures. The lab includes a manually adjustable growth slider for each species.

The integrated Next production-mode build and TypeScript check passed, as did 410 tests in 29 files. Eight Chromium browser groups exercised legacy session recovery and rejection, a single writer across two tabs, the Daily task link, setup and return navigation, task completion, breaks, tree tending, all 12 species, reduced motion and a WebGL fallback. The browser uses the real Focus components with a fictional account and browser-local records.

At 1440 × 900 the garden canvas measured 920 × 612. At 390 × 844 it measured 356 × 262, with the growing plant centered on an outer plot. The completion button cleared the emulated 34-pixel home-indicator area by 16 pixels. The controls remained tappable in both Gentle and Strict modes at 320 × 568, and in landscape at 844 × 390. A physical iPhone Safari check is still pending.

## Integration and rollout

The integration branch includes the production main revision `2a12050` and the existing Focus animals branch `a32e9db`. Local baseline `0749ab2` captures the current Focus draft, timer, recovery, account ownership and task completion changes on those two revisions. It retains the same-origin account and sign-out behavior used by the deployed navigation. The garden comes from `70f9078`. The integrated tree retains the deployed Daily notebook, including its task shortcut into Focus.

New named planting is off by default. The signed-in Grove read advertises whether the server accepts new named plants. Older responses and a failed fetch keep the picker on the four original species. Existing named sessions and trees remain readable, completable and tendable with the switch off. A repeated start uses its stored result. A stale request for a new named plant on a disabled server keeps the timer as a plain session with zero seed cost. These changes use the existing database columns.

For a future authorized release, keep `GROVE_NAMED_PLANT_STARTS` unset while compatible clients and servers roll out. Enable the server-only value `1` only after every serving version can render and process named species. If a rollback is necessary after named records have been saved, turn off new named starts and retain compatible readers. The existing Vercel Preview and Production environments share database and Supabase bindings. An authenticated staging deployment for write tests would need its own fictional database and auth environment.
