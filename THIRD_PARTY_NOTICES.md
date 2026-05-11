# Third-party attribution

This project reuses compiled **D3.js v7** from the official npm distribution (~`vendor/d3.v7.min.js`).  
License: ISC (see https://github.com/d3/d3/blob/main/LICENSE )

## Patterns (not verbatim code)

Ideas traced to these OSS projects appear in comments inside the source files:

| Reference | SPDX / license | Inspiration used |
|-----------|----------------|-------------------|
| hpn0 / **d3.timeline.js** | MIT | Clip-path layering, foreground `rect` bars, `zoom` + `rescaleX` compose |
| cooperhewitt / **d3-timeline-event-horizon** | BSD-3-Clause | Overlap-related hover emphasis (implemented without jQuery) |
| AmbiguousError / **empire** (archived upstream) | *No license detected* — study only | BCE-facing animation / intro mood (Canvas scene re-coded) |

If you fork or distribute this demo, preserve the D3 license notice and cite the repositories above wherever you reused their ideas.
