# TASK-021 — App shell: sidebar navigation, full width; own website vs. social/link pages

## Goal
Owner request 2026-10-15 (reference: his TeleCRM screenshot): full-width layout with a left sidebar menu instead of a
boxed page with a top menu; brand look stays Inženirji.si. Plus: social profiles and link-in-bio pages are not an
own website (group B) but the links are kept and clickable.

## Scope
- Route group `src/app/(app)` with a shared layout (owner check once) and `AppShell` (fixed sidebar ≥ lg, slide-in
  menu on phones, top bar with e-mail + logout). Sidebar groups: Danes · Prodaja · Izvedba · Analitika · Nastavitve;
  not-yet-built items shown disabled with "kmalu". Icons: lucide-react.
- `websiteKind()` (own / social / link / none); table shows "SAMO DRUŽBENO OMREŽJE" / "SAMO LINK" above the
  clickable link; "Brez lastne spletne strani" counter includes them.
