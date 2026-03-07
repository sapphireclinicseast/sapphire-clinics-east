/* ================================================================
   SANDBOX CLINIC — SAPPHIRE CLINICS EAST, INC.
   Main JavaScript

   EASY CUSTOMIZATION:
   - Edit the SITE_CONFIG object below to update content,
     contact info, social links, HMO logos, and more
     without touching the HTML structure.
   ================================================================ */

/* ── SITE CONFIGURATION ─────────────────────────────────────────
   Edit values here to update content site-wide.
   ─────────────────────────────────────────────────────────────── */
const SITE_CONFIG = {

  /* ── Branding ── */
  siteName:    'Sapphire Clinics East, Inc.',
  orgName:     'Sapphire Clinics East, Inc.',
  orgAbbrev:   'SCEI',
  tagline:     'Rehab for Every Age, Every Stage.',
  domain:      'sapphireclinicseast.org',

  /* ── Hero Slides (images from WEBSITE BACKGROUND folder) ── */
  heroSlides: [
    'WEBSITE BACKGROUND/1.png',
    'WEBSITE BACKGROUND/2.png',
    'WEBSITE BACKGROUND/3.png',
    'WEBSITE BACKGROUND/16.png',
    'WEBSITE BACKGROUND/17.png',
    'WEBSITE BACKGROUND/20.png',
    'WEBSITE BACKGROUND/21.png',
    'WEBSITE BACKGROUND/22.png',
  ],
  heroSlideInterval: 5000,   // ms between slides

  /* ── Key Statistics (shown in hero) ── */
  stats: [
    { num: '2',    lbl: 'Branches' },
    { num: '400+', lbl: 'Patients Served' },
    { num: '14,800+', lbl: 'Sessions (2025)' },
    { num: '4.58★', lbl: 'Satisfaction Score' },
  ],

  /* ── HMO Partners ── */
  hmos: [
    { name: 'ValuCare',                      imgSrc: 'HMO Logos/1.png' },
    { name: 'Sun Life GREPA Healthcare',      imgSrc: 'HMO Logos/2.png' },
    { name: 'PhilCare',                       imgSrc: 'HMO Logos/3.png' },
    { name: 'PhilBritish Insurance',          imgSrc: 'HMO Logos/4.png' },
    { name: 'Pacific Cross Insurance',        imgSrc: 'HMO Logos/5.png' },
    { name: 'MEDOCare Health System',         imgSrc: 'HMO Logos/6.png' },
    { name: 'MedAsia Philippines',            imgSrc: 'HMO Logos/7.png' },
    { name: 'Life & Health HMP',              imgSrc: 'HMO Logos/8.png' },
    { name: 'Lacson & Lacson Insurance',      imgSrc: 'HMO Logos/9.png' },
    { name: 'Intellicare',                    imgSrc: 'HMO Logos/10.png' },
    { name: 'HPPI / Hive Health',             imgSrc: 'HMO Logos/11.png' },
    { name: 'Avega',                          imgSrc: 'HMO Logos/12.png' },
    { name: 'AsianCare Health Systems',       imgSrc: 'HMO Logos/13.png' },
    { name: 'AMAPHIL',                        imgSrc: 'HMO Logos/14.png' },
    { name: 'iCare',                          imgSrc: 'HMO Logos/15.png' },
    { name: 'InLife / Insular Life',          imgSrc: 'HMO Logos/16.png' },
    { name: 'Generali',                       imgSrc: 'HMO Logos/Assicurazioni_Generali_logo.svg_.png' },
  ],

  /* ── Partners (schools + athletic team) ── */
  partners: [
    { name: 'Asian Institute of Management',  imgSrc: 'PARTNERS/ASIAN INSTITUTE OF MANAGEMENT.png' },
    { name: 'National University East Ortigas', imgSrc: 'PARTNERS/NATIONAL UNIVERSITY EAST ORTIGAS.png' },
    { name: "The Abba's Orchard",             imgSrc: "PARTNERS/THE ABBA'S ORCHARD.png" },
    { name: 'Bomba Pilipinas',                imgSrc: 'PARTNERS/BOMBA PILIPINAS.png' },
  ],

  /* ── Branches ── */
  branches: {
    east: {
      name:    'Sandbox Clinic – East Branch',
      address: 'Level 4, Robinsons Metro East, Marcos Highway, Brgy. Dela Paz, Santolan, Pasig',
      email:   'east.sandboxclinic@gmail.com',
      hrEmail: 'hr.sandboxcliniceast@gmail.com',
      phones:  ['+63 917 118 9289', '(02) 5310-4991'],
      services: [
        'Medical Consultations',
        'Occupational Therapy',
        'Physical Therapy',
        'Speech Language Therapy',
        'Special Education Classes',
        'Psychotherapy',
        'Orthosis and Prosthesis Fabrication',
      ],
      facilities: [
        { name: 'Reception Desk',       img: 'SBEA FACILITY PHOTOS/RECEPTION DESK.png' },
        { name: 'Feedback Area',        img: 'SBEA FACILITY PHOTOS/FEEDBACK AREA.png' },
        { name: 'Pediatric Gym',        img: 'SBEA FACILITY PHOTOS/PEDIATRIC GYM.png' },
        { name: 'Pediatric Gym II',     img: 'SBEA FACILITY PHOTOS/PEDIATRIC GYM-2.png' },
        { name: 'Pediatric Rooms',      img: 'SBEA FACILITY PHOTOS/PEDIATRIC ROOMS.png' },
        { name: 'SPED Room',            img: 'SBEA FACILITY PHOTOS/SPED ROOM.png' },
        { name: 'Adult Therapy Room 1', img: 'SBEA FACILITY PHOTOS/ADULT THERAPY ROOM 1.png' },
        { name: 'Adult Therapy Room 2', img: 'SBEA FACILITY PHOTOS/ADULT THERAPY ROOM 2.png' },
        { name: 'Adult Therapy Room 3', img: 'SBEA FACILITY PHOTOS/ADULT THERAPY ROOM 3.png' },
        { name: 'Cubicles Room',        img: 'SBEA FACILITY PHOTOS/CUBICLES ROOM.png' },
        { name: 'Cubicles Room II',     img: 'SBEA FACILITY PHOTOS/CUBICLES ROOM-2.png' },
        { name: 'Multisensory Room',    img: 'SBEA FACILITY PHOTOS/MULTISENSORY ROOM.png' },
        { name: 'Psychotherapy Room',   img: 'SBEA FACILITY PHOTOS/PSYCHOTHERAPY ROOM.png' },
        { name: 'Consultation Suite',   img: 'SBEA FACILITY PHOTOS/CONSULTATION SUITE.png' },
        { name: 'Adult Therapy Gym',    img: 'SBEA FACILITY PHOTOS/ADULT THERAPY GYM.png' },
        { name: 'Pantry',               img: 'SBEA FACILITY PHOTOS/PANTRY.png' },
        { name: 'Feedback Board',       img: 'SBEA FACILITY PHOTOS/FEEDBACK BOARD.png' },
      ],
      facebook:  'https://www.facebook.com/sandboxcliniceast',
      instagram: 'https://www.instagram.com/sandboxcliniceast/',
      linkedin:  'https://www.linkedin.com/company/sandbox-clinic-east/',
    },
    greenhills: {
      name:    'Sandbox Clinic – Greenhills Branch',
      address: 'Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City',
      email:   'east.sandboxclinic@gmail.com',
      hrEmail: 'hr.sandboxclinicgh@gmail.com',
      phones:  ['+63 917 770 1686', '(02) 8529-1590'],
      services: [
        'Medical Consultations',
        'Occupational Therapy',
        'Physical Therapy',
        'Speech Language Therapy',
        'Special Education Classes',
        'Psychotherapy',
        'Orthosis and Prosthesis Fabrication',
      ],
      facilities: [
        { name: 'Assessment Suite',         img: 'SBGH FACILITY PHOTOS/ASSESSMENT SUITE.png' },
        { name: 'Care Pods',                img: 'SBGH FACILITY PHOTOS/CARE PODS-1.png' },
        { name: 'Care Pods II',             img: 'SBGH FACILITY PHOTOS/CARE PODS-2.png' },
        { name: 'Child Development Suite',  img: 'SBGH FACILITY PHOTOS/CHILD DEVELOPMENT SUITE.png' },
        { name: 'Consultation Suite 1',     img: 'SBGH FACILITY PHOTOS/CONSULTATION SUITE 1.png' },
        { name: 'Consultation Suite 2',     img: 'SBGH FACILITY PHOTOS/CONSULTATION SUITE 2.png' },
        { name: 'Consultation Suite 3',     img: 'SBGH FACILITY PHOTOS/CONSULTATION SUITE 3.png' },
        { name: 'Early Steps Studio',       img: 'SBGH FACILITY PHOTOS/EARLY STEPS STUDIO.png' },
        { name: 'Inclusive Learning Studio',img: 'SBGH FACILITY PHOTOS/INCLUSIVE LEARNING STUDIO.png' },
        { name: 'Life Skills Studio I',     img: 'SBGH FACILITY PHOTOS/LIFE SKILLS STUDIO-1.png' },
        { name: 'Life Skills Studio II',    img: 'SBGH FACILITY PHOTOS/LIFE SKILLS STUDIO-2.png' },
        { name: 'Media & Motions Lab',      img: 'SBGH FACILITY PHOTOS/MEDIA AND MOTIONS LAB.png' },
        { name: 'Pantry & Lounge',          img: 'SBGH FACILITY PHOTOS/PANTRY AND LOUNGE.png' },
        { name: 'Pantry & Lounge II',       img: 'SBGH FACILITY PHOTOS/PANTRY AND LOUNGE-2.png' },
        { name: 'Pediatric Gym I',          img: 'SBGH FACILITY PHOTOS/PEDIATRIC GYM-1.png' },
        { name: 'Pediatric Gym II',         img: 'SBGH FACILITY PHOTOS/PEDIATRIC GYM-2.png' },
        { name: 'Pediatric Gym III',        img: 'SBGH FACILITY PHOTOS/PEDIATRIC GYM-3.png' },
        { name: 'Reception',                img: 'SBGH FACILITY PHOTOS/RECEPTION.JPG' },
        { name: 'Reception II',             img: 'SBGH FACILITY PHOTOS/RECEPTION 2.JPG' },
        { name: 'Reception III',            img: 'SBGH FACILITY PHOTOS/RECEPTION 3.JPG' },
        { name: 'Reception IV',             img: 'SBGH FACILITY PHOTOS/RECEPTION 4.JPG' },
        { name: 'Hallway',                  img: 'SBGH FACILITY PHOTOS/HALLWAY.JPG' },
      ],
      facebook:  'https://www.facebook.com/sandboxclinicgreenhills',
      instagram: 'https://www.instagram.com/sandboxclinicgh/',
    },
  },

  /* ── Social Media (global / TikTok) ── */
  tiktok: 'https://www.tiktok.com/@sandboxclinic',

  /* ── Verdana Rehab ── */
  verdanaUrl: 'https://verdanarehab.com/',

  /* ── Booking / Contact CTA ── */
  bookingNote: 'Call or message any branch to book an appointment. Walk-ins are also welcome, subject to staff availability.',

};

/* ================================================================
   INITIALIZATION
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  buildDynamicContent();
  initNavbar();
  initHeroSlider();
  initScrollReveal();
  initBranchTabs();
  initAccTabs();
  initFAQs();
  initLightbox();
  initScrollTop();
  if (typeof lucide !== 'undefined') lucide.createIcons();
});

/* ── Dynamic Content Builders ──────────────────────────────────── */
function buildDynamicContent() {
  buildHeroSlides();
  buildHeroStats();
  buildHMOs();
  buildPartners();
  buildBranches('east');
  buildBranches('greenhills');
}

function buildHeroSlides() {
  const wrap = document.getElementById('heroSlides');
  if (!wrap) return;
  wrap.innerHTML = '';
  SITE_CONFIG.heroSlides.forEach((src, i) => {
    const div = document.createElement('div');
    div.className = 'hero-slide' + (i === 0 ? ' active' : '');
    div.style.backgroundImage = `url('${src}')`;
    wrap.appendChild(div);
  });
}

function buildHeroStats() {
  const wrap = document.getElementById('heroStats');
  if (!wrap) return;
  wrap.innerHTML = SITE_CONFIG.stats.map(s => `
    <div class="hero-stat">
      <div class="hero-stat-num">${s.num}</div>
      <div class="hero-stat-lbl">${s.lbl}</div>
    </div>
  `).join('');
}

function buildHMOs() {
  const wrap = document.getElementById('hmoLogos');
  if (!wrap) return;
  wrap.innerHTML = SITE_CONFIG.hmos.map(h => `
    <div class="hmo-logo-card">
      ${h.imgSrc
        ? `<img src="${h.imgSrc}" alt="${h.name}" loading="lazy">`
        : `<span>${h.name}</span>`}
    </div>
  `).join('');
}

function buildPartners() {
  const wrap = document.getElementById('partnerLogos');
  if (!wrap) return;
  wrap.innerHTML = SITE_CONFIG.partners.map(p => `
    <div class="partner-logo-card">
      ${p.imgSrc
        ? `<img src="${p.imgSrc}" alt="${p.name}" loading="lazy">`
        : `<span>${p.name}</span>`}
    </div>
  `).join('');
}

function buildBranches(key) {
  const branch = SITE_CONFIG.branches[key];
  if (!branch) return;

  /* Services */
  const servicesEl = document.getElementById(`${key}Services`);
  if (servicesEl) {
    servicesEl.innerHTML = branch.services.map(s => `
      <div class="service-item">
        <div class="service-dot"></div>
        <span class="service-name">${s}</span>
      </div>
    `).join('');
  }

  /* Gallery */
  const galleryEl = document.getElementById(`${key}Gallery`);
  if (galleryEl) {
    galleryEl.innerHTML = branch.facilities.map((f, i) => `
      <div class="gallery-item" onclick="openLightbox('${key}', ${i})" role="button" tabindex="0" aria-label="View ${f.name}">
        <img src="${f.img}" alt="${f.name}" loading="lazy" onerror="this.parentElement.style.display='none'">
        <div class="gallery-item-overlay">
          <span class="gallery-item-name">${f.name}</span>
        </div>
      </div>
    `).join('');
  }
}

/* ── Navbar ─────────────────────────────────────────────────────── */
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  const update = () => {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
      navbar.classList.remove('hero-top');
    } else {
      navbar.classList.remove('scrolled');
      navbar.classList.add('hero-top');
    }
  };
  update();
  window.addEventListener('scroll', update, { passive: true });

  /* Hamburger */
  const ham = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  if (ham && mobileNav) {
    ham.addEventListener('click', () => {
      ham.classList.toggle('open');
      mobileNav.classList.toggle('open');
      document.body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : '';
    });
  }
}

function closeMobileNav() {
  const ham = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  if (ham) ham.classList.remove('open');
  if (mobileNav) mobileNav.classList.remove('open');
  document.body.style.overflow = '';
}

function scrollToSection(id) {
  closeMobileNav();
  const el = document.getElementById(id);
  if (!el) return;
  const offset = 80;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: 'smooth' });
}

/* ── Hero Slider ────────────────────────────────────────────────── */
function initHeroSlider() {
  const slides = document.querySelectorAll('.hero-slide');
  const dotsWrap = document.getElementById('heroDots');
  if (!slides.length) return;

  let current = 0;

  /* Build dots */
  if (dotsWrap) {
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', `Slide ${i + 1}`);
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    });
  }

  function goTo(n) {
    slides[current].classList.remove('active');
    document.querySelectorAll('.hero-dot')[current]?.classList.remove('active');
    current = (n + slides.length) % slides.length;
    slides[current].classList.add('active');
    document.querySelectorAll('.hero-dot')[current]?.classList.add('active');
  }

  setInterval(() => goTo(current + 1), SITE_CONFIG.heroSlideInterval);
}

/* ── Scroll Reveal ──────────────────────────────────────────────── */
function initScrollReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  els.forEach(el => obs.observe(el));
}

/* ── Branch Tabs ────────────────────────────────────────────────── */
function initBranchTabs() {
  /* Activated by switchBranch() */
}

function switchBranch(key) {
  document.querySelectorAll('.branch-tab').forEach(t => t.classList.toggle('active', t.dataset.branch === key));
  document.querySelectorAll('.branch-panel').forEach(p => p.classList.toggle('active', p.id === `${key}Panel`));
}

/* ── Accomplishment Tabs ────────────────────────────────────────── */
function initAccTabs() { /* Activated by switchAcc() */ }

function switchAcc(year) {
  document.querySelectorAll('.acc-tab').forEach(t => t.classList.toggle('active', t.dataset.year === year));
  document.querySelectorAll('.acc-panel').forEach(p => p.classList.toggle('active', p.id === `acc${year}`));
}

/* ── FAQs ───────────────────────────────────────────────────────── */
function initFAQs() {
  document.querySelectorAll('.faq-item').forEach(item => {
    const q = item.querySelector('.faq-q');
    if (!q) return;
    q.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(o => o.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
    q.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); q.click(); } });
  });
}

/* ── Lightbox ───────────────────────────────────────────────────── */
let _lbBranch = null, _lbIdx = 0;

function initLightbox() {
  const lb = document.getElementById('lightbox');
  if (!lb) return;

  lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft')  lbNav(-1);
    if (e.key === 'ArrowRight') lbNav(1);
  });
}

function openLightbox(branch, idx) {
  _lbBranch = branch;
  _lbIdx    = idx;
  updateLightbox();
  document.getElementById('lightbox')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox')?.classList.remove('open');
  document.body.style.overflow = '';
}

function lbNav(dir) {
  if (!_lbBranch) return;
  const facilities = SITE_CONFIG.branches[_lbBranch].facilities;
  _lbIdx = (_lbIdx + dir + facilities.length) % facilities.length;
  updateLightbox();
}

function updateLightbox() {
  if (!_lbBranch) return;
  const f = SITE_CONFIG.branches[_lbBranch].facilities[_lbIdx];
  const img = document.getElementById('lbImg');
  const cap = document.getElementById('lbCaption');
  if (img) { img.src = f.img; img.alt = f.name; }
  if (cap) cap.textContent = f.name;
}

/* ── Scroll to Top ──────────────────────────────────────────────── */
function initScrollTop() {
  const btn = document.getElementById('scrollTop');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ── Keyboard accessibility for gallery items ───────────────────── */
document.addEventListener('keydown', e => {
  if (e.target.classList.contains('gallery-item') && (e.key === 'Enter' || e.key === ' ')) {
    e.target.click();
  }
  // Close post modal with Escape
  if (e.key === 'Escape') closePostModal();
});

/* ══════════════════════════════════════════════════════════════════
   NEWS & UPDATES — CMS-driven content
══════════════════════════════════════════════════════════════════ */

/* Load all three news sections from generated JSON files */
async function loadNewsSection() {
  const sections = ['blog', 'events', 'announcements'];
  for (const section of sections) {
    try {
      const res = await fetch(`content/${section}-index.json?v=${Date.now()}`);
      if (!res.ok) throw new Error('empty');
      const posts = await res.json();
      renderNewsPosts(section, posts);
    } catch (_) {
      renderNewsEmpty(section);
    }
  }
}

/* Render post cards for a given section */
function renderNewsPosts(section, posts) {
  const container = document.getElementById(`news-posts-${section}`);
  if (!container) return;
  if (!posts || posts.length === 0) { renderNewsEmpty(section); return; }

  container.innerHTML = posts.map((post, i) => {
    const delayClass = i > 0 ? ` delay-${Math.min(i, 3)}` : '';
    const branchBadge = post.branch
      ? `<span class="news-post-branch">${escHtml(post.branch)}</span>` : '';
    const locationBadge = post.location
      ? `<span class="news-post-branch">📍 ${escHtml(post.location)}</span>` : '';
    return `
      <div class="news-post-card reveal${delayClass}">
        <div class="news-post-meta">
          <span class="news-post-date">${fmtDate(post.date)}</span>
          ${branchBadge}${locationBadge}
        </div>
        <h3 class="news-post-title">${escHtml(post.title)}</h3>
        <p class="news-post-summary">${escHtml(post.summary || '')}</p>
        <button class="news-read-more"
          onclick='openPostModal(${JSON.stringify(post).replace(/'/g,"&#39;")})'>
          Read More <i data-lucide="arrow-right" style="width:13px;height:13px;vertical-align:middle;margin-left:2px;"></i>
        </button>
      </div>`;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
  // Trigger scroll reveal on new cards
  document.querySelectorAll(`#news-posts-${section} .reveal`).forEach(el => {
    if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('visible');
  });
}

/* Empty state when no posts exist yet */
function renderNewsEmpty(section) {
  const container = document.getElementById(`news-posts-${section}`);
  if (!container) return;
  const labels = { blog: 'blog posts', events: 'events', announcements: 'announcements' };
  container.innerHTML = `
    <div class="news-empty">
      <i data-lucide="inbox" style="width:40px;height:40px;color:var(--primary-light);margin-bottom:12px;"></i>
      <p>No ${labels[section] || 'posts'} yet — check back soon!</p>
    </div>`;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* Switch between tab panels */
function switchNewsTab(tab) {
  document.querySelectorAll('.news-tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab));
  document.querySelectorAll('.news-tab-panel').forEach(panel =>
    panel.classList.toggle('active', panel.id === `news-panel-${tab}`));
}

/* Open post modal with full content */
function openPostModal(post) {
  const el = id => document.getElementById(id);
  const branchBadge = post.branch
    ? `<span class="news-post-branch">${escHtml(post.branch)}</span>` : '';
  const locationBadge = post.location
    ? `<span class="news-post-branch">📍 ${escHtml(post.location)}</span>` : '';

  el('postModalMeta').innerHTML =
    `<span class="news-post-date">${fmtDate(post.date)}</span>${branchBadge}${locationBadge}`;
  el('postModalTitle').textContent = post.title || '';

  const body = post.body || '';
  el('postModalBody').innerHTML =
    (typeof marked !== 'undefined') ? marked.parse(body) : body.replace(/\n/g, '<br>');

  el('postModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

/* Close post modal */
function closePostModal(e) {
  // Only close if clicking overlay background or the × button
  if (e && e.target !== document.getElementById('postModal') &&
      !e.target.classList.contains('post-modal-close')) return;
  document.getElementById('postModal').classList.remove('active');
  document.body.style.overflow = '';
}

/* Helpers */
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function id(s) { return document.getElementById(s); }

/* Netlify Identity redirect helper (CMS login) */
if (window.netlifyIdentity) {
  window.netlifyIdentity.on('init', user => {
    if (!user) {
      window.netlifyIdentity.on('login', () => {
        document.location.href = '/admin/';
      });
    }
  });
}

/* Load news on DOM ready */
document.addEventListener('DOMContentLoaded', () => loadNewsSection());
