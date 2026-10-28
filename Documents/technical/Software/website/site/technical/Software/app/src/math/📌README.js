// Renders the LaTeX already on this page with KaTeX (math page only).
// The page's markdown is rendered with marked, which has no math support:
// it can split a display equation across elements (emphasis parsing) and
// turns "\," into ",". Before auto-render runs, each paragraph that IS a
// display equation is collapsed back to a single text node, restoring the
// equation exactly as written (thin-space commas aside, which KaTeX renders
// fine). If KaTeX fails to load or a formula fails to parse, the LaTeX
// source stays visible.
(function () {
  var base = "https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/";

  function loadCss(href) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function restoreDisplayMathParagraphs() {
    var paragraphs = document.querySelectorAll("p");
    for (var i = 0; i < paragraphs.length; i++) {
      var p = paragraphs[i];
      var text = p.textContent.trim();
      // Only paragraphs that are exactly one display equation: collapsing
      // one to its own text is lossless and undoes any emphasis splitting.
      if (text.indexOf("$$") !== 0 || text.lastIndexOf("$$") !== text.length - 2) {
        continue;
      }
      p.replaceChildren(document.createTextNode(p.textContent));
    }
  }

  loadCss(base + "katex.min.css");
  loadScript(base + "katex.min.js")
    .then(function () {
      return loadScript(base + "contrib/auto-render.min.js");
    })
    .then(function () {
      restoreDisplayMathParagraphs();
      renderMathInElement(document.body, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    })
    .catch(function () {
      // KaTeX unavailable: leave the LaTeX source visible.
    });
})();
