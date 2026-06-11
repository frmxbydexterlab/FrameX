---
name: Pro-BIM Precision
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363940'
  surface-container-lowest: '#0b0e14'
  surface-container-low: '#191c22'
  surface-container: '#1d2026'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e1e2eb'
  on-surface-variant: '#c1c6d7'
  inverse-surface: '#e1e2eb'
  inverse-on-surface: '#2e3037'
  outline: '#8b91a0'
  outline-variant: '#414754'
  surface-tint: '#abc7ff'
  primary: '#abc7ff'
  on-primary: '#002f66'
  primary-container: '#448fff'
  on-primary-container: '#002859'
  inverse-primary: '#005cbc'
  secondary: '#c6c6c7'
  on-secondary: '#2f3131'
  secondary-container: '#454747'
  on-secondary-container: '#b4b5b5'
  tertiary: '#c4c6d2'
  on-tertiary: '#2d3039'
  tertiary-container: '#8e909b'
  on-tertiary-container: '#272933'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d7e2ff'
  primary-fixed-dim: '#abc7ff'
  on-primary-fixed: '#001b3f'
  on-primary-fixed-variant: '#004590'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e0e2ee'
  tertiary-fixed-dim: '#c4c6d2'
  on-tertiary-fixed: '#181b24'
  on-tertiary-fixed-variant: '#444650'
  background: '#10131a'
  on-background: '#e1e2eb'
  surface-variant: '#32353c'
typography:
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  space-xs: 4px
  space-sm: 8px
  space-md: 16px
  space-lg: 24px
  panel-margin: 12px
  gutter: 8px
---

## Brand & Style
The design system embodies a high-performance, technical aesthetic tailored for professional engineering and BIM (Building Information Modeling) environments. It prioritizes data density, visual clarity, and a "mission control" atmosphere. 

The style is a hybrid of **Minimalism** and **High-Contrast Glassmorphism**, utilizing deep, monochromatic backgrounds to make vibrant functional accents and crisp white secondary elements pop. It evokes feelings of precision, structural integrity, and advanced technological capability. The UI feels like a series of distinct, highly-rounded layers over complex data, using subtle translucency and 1px borders to define workspace boundaries.

## Colors
This design system utilizes a "Deep Space" palette with high-contrast highlights to minimize eye strain during long technical sessions. 

- **Primary Canvas:** The main background uses `#0B0E14`, a deep navy-black that provides infinite depth for 3D viewports.
- **Secondary Highlight:** Pure White (`#FFFFFF`) is used for secondary actions, high-contrast borders, and prominent surface accents to ensure key technical information stands out.
- **Action & Focus:** The vibrant `#007FFF` Blue is reserved strictly for primary actions, active toggle states, and selection highlights.
- **Data Accents:** Success and warning states use high-chroma greens and ambers to stand out against the dark canvas without disrupting the professional tone.

## Typography
The typography is built around **Inter**, chosen for its exceptional legibility in small-scale, data-heavy interfaces. The scale is intentionally compact to maximize information density.

- **Headlines:** Used sparingly for panel titles and major modal headers.
- **Labels:** Uppercase labels with slight tracking are used for section headers within the Inspector to create clear visual hierarchy in dense property lists.
- **Technical Data:** For coordinate systems, dimensions, and numerical outputs, a monospaced font (JetBrains Mono) is used to ensure character alignment.
- **Contrast:** Use white (`#FFFFFF`) for primary text and a muted grey (`#9499A6`) for secondary descriptions and inactive labels.

## Layout & Spacing
The layout follows a **Fixed-Panel Fluid-Viewport** model. Sidebars (Navigation and Inspector) have fixed widths (approx. 280px - 320px), while the central 3D viewport expands to fill the remaining space.

- **Grids:** Internal panel layouts use an 8px base grid.
- **Floating Toolbars:** Toolbars are decoupled from the main panel borders, floating with a `12px` margin from the viewport edge to emphasize the "Glassmorphism" effect.
- **Density:** Padding is tight (`8px` to `12px` within components) to allow for the complex nesting of property fields and accordion groups.

## Elevation & Depth
Depth is signaled through **transparency, borders, and high-contrast overlaps** rather than traditional heavy shadows.

- **Level 0:** The 3D Viewport / Background.
- **Level 1:** Side panels and footers. These use a 1px solid border (`rgba(255, 255, 255, 0.08)`) and a background blur of `12px`.
- **Level 2:** Floating toolbars and active modals. These feature a slightly lighter background fill and a very subtle, large-radius ambient shadow (`0px 8px 24px rgba(0,0,0,0.4)`) to distinguish them from static panels.
- **Selection:** Items are "elevated" visually using the Primary Blue glow or pure white outlines to signify focus.

## Shapes
The design system uses "Pill-Shaped" geometry. While the domain is technical, the extremely rounded corners provide a modern, premium aesthetic that softens the complexity of the data.

- **Panels & Large Containers:** Use `rounded-xl` (32px) to frame the workspace, creating a distinct "capsule" look for sidebars.
- **Buttons & Inputs:** Use `rounded-lg` (16px) or full pill-rounding for a fluid, professional look.
- **Tool Selection:** Active states in the toolbar use a high-contrast circular or pill shape to indicate the "current mode."

## Components

### Buttons & Actions
- **Primary:** Solid `#007FFF` fill with white text. Highly rounded (pill-shaped).
- **Secondary:** Solid `#FFFFFF` fill with `#0B0E14` text. Used for high-visibility secondary actions.
- **Ghost:** 1px white or blue border with no fill. Used for secondary actions in toolbars.

### Inspector Accordions
- Vertical stacks of collapsible headers with high corner rounding on the outer container.
- Headers feature a 1px bottom divider and a chevron-right (collapsed) or chevron-down (expanded) icon.
- Content within accordions uses a high-density vertical rhythm.

### Floating Toolbars
- Horizontal or vertical bars with a background blur and `rounded-full` (pill) geometry.
- Individual tools are represented by icons; active tools utilize a primary-colored background "tile."

### Input Fields
- Dark backgrounds (`#0B0E14`) with a 1px white or blue border depending on focus state.
- Highly rounded corners (`16px`) to match the system's "Pill-shaped" aesthetic.
- Labels are positioned either above the field or inline for compact "Value/Unit" pairs.

### Progress & Status
- Circular gauges for "AI Efficiency" or "Material Breakdown" utilize high-contrast stroke colors against the dark background, maintaining the system's technical, data-centric feel.