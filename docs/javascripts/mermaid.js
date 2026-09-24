import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

function renderMermaidDiagrams() {
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      primaryColor: "#ebe1d7",
      primaryTextColor: "#302923",
      primaryBorderColor: "#735d4d",
      lineColor: "#85786d",
      secondaryColor: "#f7f2ec",
      tertiaryColor: "#f7f2ec",
    },
  });

  mermaid.run({ querySelector: ".mermaid" }).catch((error) => {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.error(`Mermaid render failed: ${message}`);
  });
}

if (typeof document$ !== "undefined") {
  document$.subscribe(renderMermaidDiagrams);
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderMermaidDiagrams);
} else {
  renderMermaidDiagrams();
}
