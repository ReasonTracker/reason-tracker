(() => {
  const heading = document.querySelector(".markdown-body > h1, h1");
  if (!heading) {
    return;
  }

  const words = heading.textContent.trim().split(/\s+/).filter(Boolean);
  if (words.length !== 2) {
    return;
  }

  heading.textContent = "";

  words.forEach((word, index) => {
    const part = document.createElement("div");
    part.className = `split-${index + 1}`;
    part.textContent = word;
    heading.appendChild(part);
  });
})();
