const SITE = {
    name: "Nayeli Moreno",
    year: "2026",
    tagline: "Teacher • Creator • Resource Maker",

    links: {
        tpt: "https://...",
        amazon: "https://...",
        instagram: "https://...",
        tiktok: "https://..."
    }
    
};
document.querySelectorAll("[data-site-name]").forEach((element) => {
    element.textContent = SITE.name;
});

document.querySelectorAll("[data-site-year]").forEach((element) => {
    element.textContent = SITE.year;
});

document.querySelectorAll("[data-site-tagline]").forEach((element) => {
    element.textContent = SITE.tagline;
});