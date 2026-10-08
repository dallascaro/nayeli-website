const SITE = {
    name: "Nayeli Moreno",
    year: "2026",

    tagline: "Teacher • Creator • Resource Maker",

    bio: "Welcome! Find my resources, recommendations, and favorite links in one place.",

    about: {
        title: "About Me",
        description: ""
    },

    links: {
        amazon: "https://www.amazon.com/shop/nymoren?tag=nayelimoreno-20&ref_=cm_sw_r_mwn_aipsfshop_SEBZV16BP07X0M4SXGZY&language=en-US",
        instagram: "https://www.instagram.com/nymorenoo",
        tiktok: "https://www.tiktok.com/@nymoren"
    },

    resources: {
        tpt: {
            title: "Teachers Pay Teachers",
            description: "",
            url: ""
        },

        amazon: {
            title: "Amazon Favorites",
            description: "",
            url: "https://www.amazon.com/shop/nymoren?tag=nayelimoreno-20&ref_=cm_sw_r_mwn_aipsfshop_SEBZV16BP07X0M4SXGZY&language=en-US"
        }
    }
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

document.querySelectorAll("[data-site-about-description]").forEach((element) => {
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


/* =========================
   RESOURCES
========================= */

document.querySelectorAll("[data-resource]").forEach((element) => {
    const resourceName = element.dataset.resource;
    const resource = SITE.resources[resourceName];

    if (!resource) {
        return;
    }

    const title = element.querySelector("[data-resource-title]");
    const description = element.querySelector("[data-resource-description]");
    const link = element.querySelector("[data-resource-link]");

    if (title) {
        title.textContent = resource.title;
    }

    if (description) {
        description.textContent = resource.description;
    }

    if (link && resource.url) {
    link.href = resource.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
}
});