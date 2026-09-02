function renderMermaidDiagrams() {
  if (typeof mermaid === "undefined") return;

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

  mermaid.run({ querySelector: ".mermaid" });
}

if (typeof document$ !== "undefined") {
  document$.subscribe(renderMermaidDiagrams);
} else {
  document.addEventListener("DOMContentLoaded", renderMermaidDiagrams);
}
