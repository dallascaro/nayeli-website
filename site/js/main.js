const SITE = {
  name: "School Psych NY",
  year: "2026",

  tagline: "School Psychologist • Creator",

  bio: "Welcome! Find my resources, recommendations, and favorite links in one place.",

  about: {
    title: "About Me",
    description:
      "I have a bachelor's degree in Early Childhood Education (EC–6) and an Ed.S. in School Psychology. I am currently a licensed school psychologist.",
  },

  links: {
    amazon:
      "https://www.amazon.com/shop/nymoren?tag=nayelimoreno-20&ref_=cm_sw_r_mwn_aipsfshop_SEBZV16BP07X0M4SXGZY&language=en-US",
    instagram: "https://www.instagram.com/nymorenoo",
    tiktok: "https://www.tiktok.com/@nymoren",
  },
};

/* =========================
   SITE CONTENT
========================= */

document.querySelectorAll("[data-site-name]").forEach((element) => {
  element.textContent = SITE.name;
});

document.querySelectorAll("[data-site-year]").forEach((element) => {
  element.textContent = SITE.year;
});

document.querySelectorAll("[data-site-tagline]").forEach((element) => {
  element.textContent = SITE.tagline;
});

document.querySelectorAll("[data-site-bio]").forEach((element) => {
  element.textContent = SITE.bio;
});

document.querySelectorAll("[data-site-about-title]").forEach((element) => {
  element.textContent = SITE.about.title;
});

document
  .querySelectorAll("[data-site-about-description]")
  .forEach((element) => {
    element.textContent = SITE.about.description;
  });

/* =========================
   LINKS
========================= */

document.querySelectorAll("[data-site-link]").forEach((element) => {
  const linkName = element.dataset.siteLink;
  const url = SITE.links[linkName];

  if (url) {
    element.href = url;
    element.target = "_blank";
    element.rel = "noopener noreferrer";
  }
});
