# Sandbox Clinic Website — Project Memory

## Project Overview
Website for Sapphire Clinics East, Inc. (SCEI) operating Sandbox Clinic.
Domain: sapphireclinicseast.org

## File Structure
```
Website/
├── index.html              ← Main website (created Mar 2026)
├── css/style.css           ← All styles (CSS variables for easy theming)
├── js/main.js              ← All JS + SITE_CONFIG for easy content editing
├── WEBSITE BACKGROUND/     ← Background/hero images (1-9, 16-17, 20-27 .png + 5 .JPG)
├── SBEA FACILITY PHOTOS/   ← Sandbox East facility photos (17 .png files)
├── SBGH FACILITY PHOTOS/   ← Sandbox Greenhills facility photos (17 .png files)
├── SCEI 2024 Dashboard.html ← Embedded as iframe in Accomplishments tab
└── SCEI 2025 Dashboard v3.html ← Embedded as iframe in Accomplishments tab
```

## Brand Colors (from SCEI logo)
- `--primary: #28788c` — main steel-blue teal
- `--primary-dark: #1a607a`
- `--primary-darker: #0d3d50`
- `--primary-light: #4aafc4`
- `--primary-xlight: #d8eef2`

## Key Customization Points
- **Content/data**: Edit `SITE_CONFIG` object in `js/main.js`
  - HMO logos: add `imgSrc` path to each HMO entry
  - Partner institution logos: add `imgSrc` path
  - Hero slides: add/remove image paths in `heroSlides` array
  - Stats: update numbers in `stats` array
- **Colors/theme**: Edit `:root` CSS variables in `css/style.css`
- **Text content**: Edit directly in `index.html` (clearly commented sections)

## Sections (in order)
1. Hero (full-screen slider, auto-rotating background images)
2. Accredited HMOs (logo grid — placeholders, replace with real logos)
3. Partner Institutions (logo grid — placeholders)
4. About Us (Mission, Vision, BHAG, Core Values)
5. Book CTA Strip
6. Leadership Team (5 board members with bios)
7. Branches (tabbed: East + Greenhills, each with services + gallery)
8. Accomplishments (tabbed: 2024 + 2025, embedded iframes)
9. Careers (hiring info + 6 benefit cards)
10. FAQs (4 categories, accordion)
11. News (placeholder cards)
12. Contact (branch contact cards, social links, Verdana Rehab banner)
13. Footer

## Branches
- **East**: Level 4 Robinsons Metro East, Pasig | +63 917 118 9289 | (02) 5310-4991
- **Greenhills**: Level 8 GH Tower Offices, San Juan | +63 917 770 1686 | (02) 8529-1590
- Both email: east.sandboxclinic@gmail.com
- HR East: hr.sandboxcliniceast@gmail.com | HR GH: hr.sandboxclinicgh@gmail.com

## Social Media
- TikTok: @sandboxclinic
- East: fb/sandboxcliniceast, ig/sandboxcliniceast, LinkedIn sandbox-clinic-east
- Greenhills: fb/sandboxclinicgreenhills, ig/sandboxclinicgh

## To Deploy on sapphireclinicseast.org
Upload all files maintaining the exact folder structure. The site is fully static (no backend needed).
Consider compressing the large PNG images (5-8MB each) for faster web loading.

## User Preferences
- Wants website easily customizable and editable
- Separate CSS and JS files for maintainability
- SITE_CONFIG object for content management
