const SITE = {
  name: "School Psych Ny",
  year: "2026",

  tagline: "School Psychologist • Creator",

  bio: "Welcome! Find my resources, recommendations, and favorite links in one place.",

  about: {
    title: "About Me",
    description: "Hi, I’m Nayeli! 🍎\n\nI’m a school psychologist licensed to practice in Texas and Arkansas.\n\nBefore becoming a school psychologist, I went to Texas Tech University, where I earned my bachelor’s degree in Early Childhood Education EC–6. I spent about two years teaching bilingual and ESL math before deciding to take a different path and pursue school psychology.\n\nI went on to earn my Educational Specialist degree in School Psychology from the University of Central Arkansas, and I’ve loved getting to grow in this field ever since!\n\nI created this website because I’m constantly finding resources, activities, and little things that make my job easier, and I wanted a place to share them. Some of the resources here are things I’ve created myself, while others are things I’ve found from fellow school psychologists, counselors, teachers, and other educators that I genuinely love and use.\n\nAt the end of the day, if something on this website—or one of my videos—can help even one person feel a little more prepared, save a little time, or make their day at school a little easier, then I feel like it’s worth sharing. 💕🧠🍎\n\nI hope you find something here that you love as much as I do!",
  },

  links: {
    amazon:
      "https://www.amazon.com/shop/nymoren?tag=nayelimoreno-20&ref_=cm_sw_r_mwn_aipsfshop_SEBZV16BP07X0M4SXGZY&language=en-US",
    instagram: "https://www.instagram.com/schoolpsychny",
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
