window.tailwind = window.tailwind || {};
window.tailwind.config = {
  theme: {
    extend: {
      colors: {
        liad: {
          bg: "rgb(var(--color-liad-bg) / <alpha-value>)",
          panel: "rgb(var(--color-liad-panel) / <alpha-value>)",
          card: "rgb(var(--color-liad-card) / <alpha-value>)",
          text: "rgb(var(--color-liad-text) / <alpha-value>)",
          muted: "rgb(var(--color-liad-muted) / <alpha-value>)",
          purple: "rgb(var(--color-liad-purple) / <alpha-value>)",
          violet: "rgb(var(--color-liad-violet) / <alpha-value>)",
          blue: "rgb(var(--color-liad-blue) / <alpha-value>)",
          orange: "rgb(var(--color-liad-orange) / <alpha-value>)",
          success: "rgb(var(--color-liad-success) / <alpha-value>)"
        }
      },
      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)"
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        glow: "var(--shadow-glow)",
        cta: "var(--shadow-cta)"
      }
    }
  }
};
