# GOVbot Landing Page Conversation Rail Redesign

## Summary

Refactor the landing page into a WhatsApp-first brand surface that makes GOVbot feel like a premium guided assistant instead of a generic scholarship SaaS site. The hero becomes a two-column composition with editorial copy on the left and an interactive 3D phone mockup on the right. That same phone object persists into a scroll-driven story below the fold, shifting through product states such as eligibility, OCR, auto-fill, and tracking.

The redesign must follow the existing GOVbot cinematic design rules where they strengthen the product identity:

- warm dark canvas
- one decisive saffron accent
- flat surfaces by default
- motion through transform and opacity only
- premium depth through composition, not neon or gradient gimmicks

The redesign also applies the local Impeccable guidance for brand-register landing pages:

- avoid reflex-default fonts already used in the repo
- build a stronger typographic hierarchy
- use a bold sans plus a restrained serif accent where it adds voice
- avoid the overused editorial-magazine startup aesthetic

## Goals

- Make the landing page communicate GOVbot's actual entry point in the first screen: WhatsApp
- Replace the current light startup look with a darker premium cinematic presentation
- Introduce a reusable phone object that can power the hero and follow-on story sections
- Improve conversion toward WhatsApp onboarding while still leaving a secondary path to learn more
- Restructure the homepage into reusable components instead of a single oversized page file

## Non-Goals

- Redesign the entire product UI outside the landing page flow
- Add a true 3D scene framework such as `react-three-fiber`
- Add a full `shadcn/ui` installation just for this page
- Build fake decorative effects that dilute the GOVbot visual system

## Product Framing

The page should present GOVbot as a fast guided assistant for government workflows, not as a generic scholarship directory. The copy and motion need to make this legible immediately:

- start on WhatsApp
- send one set of details and documents
- get scheme matching and application help
- keep tracking and reminders in one thread

The tone should feel confident, premium, and useful. It should not sound like ad copy. It should not lean on generic AI language.

## Visual Direction

### Register

This page is a brand-register surface. The design itself is the deliverable, so the layout, typography, and motion should feel more authored than the rest of the app.

### Color Strategy

Use the existing GOVbot cinematic palette:

- deep warm near-black for page backgrounds
- muted warm greys for surfaces and borders
- one saffron accent for CTA states, active rails, highlights, and selective chips
- no purple, blue, pink, multicolor gradients, or decorative glass

Accent usage should stay disciplined. The phone and page can feel rich without becoming noisy.

### Typography

Replace the current landing-page defaults with a more deliberate pairing:

- primary voice: `Familjen Grotesk`
- selective emphasis: `Source Serif 4`
- utility and metadata: existing monospace only where data-like content needs it

Usage rules:

- Hero headline and most interface text stay in the sans family
- Serif appears selectively in one or two emphasized phrases or section pull lines
- The phone UI stays mostly sans for clarity and familiarity
- Use a stronger hierarchy than the current page: larger display text, tighter tracking on large headlines, more contrast between headline, body, and small labels
- On dark backgrounds, increase body line-height and add a small amount of tracking compensation

### Physical Scene

The page should feel like a premium device demonstration in a dark room, with the phone lit as the focal object. That physical scene justifies the dark theme and the emphasis on rim light, grain, and grounded depth.

## Hero

### Layout

Two-column layout on desktop:

- left: editorial copy, CTA cluster, and a small proof strip
- right: interactive `PhoneStage`

On mobile, the copy stacks above the phone. The phone remains prominent and should not collapse into a tiny decorative element.

### Copy Structure

The hero copy must make WhatsApp the front door. The exact wording can be refined during implementation, but the structure should be:

- short kicker establishing the assistant frame
- direct headline about starting government help on WhatsApp
- supporting copy about checking schemes, handling documents, auto-filling forms, and tracking progress
- primary CTA: `Start on WhatsApp`
- secondary CTA: `See how it works`

Any proof or supporting line should reinforce trust and workflow range, not generic metrics.

### Phone Object

The hero visual is an iPhone-like device rendered with HTML, CSS, and Motion, not canvas or WebGL.

Requirements:

- slim graphite hardware silhouette
- believable bezels and rounded display corners
- subtle side-button detailing
- layered depth: hardware shell, glass plane, screen content, and a grounded shadow plane
- slight saffron rim light used sparingly
- no literal Apple branding

### Phone Interaction

Desktop:

- controlled pointer-driven tilt
- depth separation between hardware, glass, and conversation content
- subtle hover response that feels precise, not playful

Mobile:

- static or gently animated pose
- no pointer dependency

Accessibility:

- obey `prefers-reduced-motion`
- preserve a readable static composition when motion is reduced

### Conversation Rail

The phone screen contains a premium WhatsApp-style conversation rail using local, shadcn-style visual primitives:

- message cards
- status chips
- small inline metadata rows
- restrained separators

Content should reflect real GOVbot capabilities. The sequence should show:

1. the citizen asking for help because the portals are fragmented
2. GOVbot asking for Aadhaar or documents once and promising scheme matching
3. eligibility and document-state chips appearing
4. the citizen asking about post-submission tracking
5. GOVbot confirming tracking, reminders, and status changes

The sequence must feel product-specific and credible. It should not look like a generic chatbot demo.

## Scroll Story

The same phone object continues into the sections below the hero. It becomes the narrative spine of the page instead of a one-screen visual.

### Structure

Use a sticky phone column paired with changing copy panels. As the user scrolls through story bands:

1. the phone rotates from the angled hero pose toward a calmer front-facing posture
2. the screen content transitions between product states
3. adjacent copy explains the current stage

### Story Bands

Recommended sequence:

1. `Eligibility`
2. `Document OCR`
3. `Auto-fill`
4. `Tracking and reminders`
5. `Final CTA`

Each band should map to a concrete state in the phone UI. Avoid generic feature-card sections that ignore the phone object.

### Motion Rules

- scroll-linked transforms only
- opacity transitions for content swaps
- no layout-property animation
- maintain a premium, smooth pacing rather than hyperactive motion

If `lenis` is already useful in the current app shell, it can be used to smooth scroll orchestration. It is not mandatory if native scroll plus Motion feels stable enough.

## Component Architecture

Refactor the page into reusable components instead of keeping all markup inside `frontend/pages/index.tsx`.

Target structure:

- `HeroSection`
- `PhoneStage`
- `PhoneHardware`
- `ConversationRail`
- `ChatBubble`
- `StatusChip`
- `ScrollStorySection`
- optional small primitives for buttons, labels, and proof rows if extraction improves clarity

Guidelines:

- keep the phone as a reusable product object, not a page-specific ornament
- separate motion orchestration from pure presentational subcomponents where practical
- accept content via config or props when that improves reuse across pages

## React And Motion Approach

Implementation should follow modern React discipline without premature abstraction.

- Use Motion's scroll and motion-value APIs for pointer tilt and scroll-linked transforms
- Derive visual movement from motion values instead of driving frequent React state updates
- Use plain React state only for discrete UI state, such as the current story step if needed
- Avoid unnecessary `useMemo` and `useCallback` unless they solve a demonstrated issue or match surrounding code patterns
- Build reduced-motion handling from the start
- Keep 3D depth CSS-based through `perspective`, `transform-style`, `rotateX`, `rotateY`, `translateZ`, and layered shadows

No `react-three-fiber` is needed for this scope.

## Styling Constraints

- preserve the GOVbot cinematic palette and motion rules
- avoid gradient text
- avoid glassmorphism
- avoid rainbow or multi-accent treatments
- avoid repeated icon-card grids as the core storytelling device
- avoid template-like hero metrics

The page should feel premium through typography, spacing, material depth, and authored motion.

## Responsive Behavior

Desktop:

- maintain the split-stage hero
- keep the phone large enough to feel like the hero anchor
- allow room for depth without clipping the hardware silhouette

Tablet:

- preserve the phone prominence while reducing tilt and complexity

Mobile:

- stack the hero naturally
- keep the device readable and attractive without over-relying on hover or pointer effects
- turn the scroll story into stacked sections if sticky behavior becomes cramped

## Performance

- use CSS and Motion transforms rather than expensive scene rendering
- keep layered effects lightweight
- ensure the hero remains performant on mid-range devices
- load any new fonts responsibly and avoid obvious layout shift

## Testing And Verification

Implementation is complete only after:

- `npm run lint` passes in `frontend/`
- `npm run build` passes in `frontend/`
- the landing page is checked for usable desktop and mobile layouts
- reduced-motion behavior is confirmed at least by code path and local interaction review

## Open Implementation Notes

- The repo currently lacks `PRODUCT.md` and `DESIGN.md` files expected by the local Impeccable workflow. That is not a blocker for this refactor, but the landing page should still follow the documented brand-register rules already reviewed from the local skill files.
- The repo does not currently have a `shadcn/ui` install. Recreate the visual quality through local components rather than adding the entire library unless a broader adoption decision is made later.
- The existing older redesign spec in this repo should be treated as superseded for the landing page work because it conflicts with the approved direction and typography rules.
