(async () => {
  const article = document.querySelector(".markdown-body");
  const heading = article?.querySelector(":scope > h1");
  if (!(article instanceof Element) || !(heading instanceof Element)) {
    return;
  }

  const tagline = article.querySelector(":scope > blockquote");
  const host = document.createElement("div");
  host.className = "rt-home-brand-sequence";

  const { mountHomeBrandSequence } = await import("/modules/home-brand-sequence.js");

  heading.replaceWith(host);
  if (tagline instanceof Element) {
    tagline.remove();
  }

  mountHomeBrandSequence(host, { playbackMode: "intro-only" });
})().catch((error) => {
  console.error("Failed to mount homepage brand sequence.", error);
});
