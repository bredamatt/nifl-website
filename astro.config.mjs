// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // site: 'https://nifl.ai',

  // No Markdown code blocks on this site. Turning Shiki off keeps its inline styles out of the CSP.
  markdown: { syntaxHighlight: false },

  // Astro hashes every script and style it outputs and adds a CSP <meta> tag to each page.
  // Headers that only work as real HTTP headers (like frame-ancestors) go in your host's config.
  security: {
    csp: {
      directives: [
        "default-src 'none'",
        "img-src 'self'",
        "font-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
      ],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'"] },
    },
  },
});
