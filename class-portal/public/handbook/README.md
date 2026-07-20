# Staff Portal Handbook — screenshots

Drop screenshots into this folder to fill the slots in the Staff Portal
Handbook (Class Portal → Admin → **Staff Portal Handbook**, main admin only).

- Use the **exact filenames** below (PNG). Each empty slot in the handbook
  shows the filename it expects, so you can match them up on screen.
- Any slot without a file is **hidden from the PDF / Word export**, so a
  partially-illustrated handbook still exports cleanly.
- Capture the real screens from `staff.sapphireclinicseast.org`. Landscape,
  ~1400px wide looks best; crop to the relevant panel.

| Filename | Screen to capture |
|----------|-------------------|
| `01-login.png` | The sign-in screen at staff.sapphireclinicseast.org |
| `02-sidebar.png` | The left sidebar (nav + user chip + Sign Out) once signed in |
| `03-branch-toggle.png` | The East / Greenhills toggle at the top (a multi-branch account) |
| `04-dashboard-3rs.png` | The Dashboard — today's sessions + the 3 R's reminder panel |
| `05-clinic-schedule.png` | The Clinic Schedule weekly view |
| `06-patients.png` | The Patients list with the Active / Read-only / Discharged filters |
| `07-session-note.png` | A session note editor with the **Send to patient** action |
| `08-directory-qr.png` | The Directory landing with the Online Forms QR panel |
| `09-admin-panel.png` | The Admin Panel (account management) |

After adding files, commit them and deploy — they ship as static assets
under `/handbook/<filename>` on `class.sapphireclinicseast.org`.
