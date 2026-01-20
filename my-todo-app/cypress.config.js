import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    specPattern: "cypress/e2e/**/*.cy.{js,ts,jsx,tsx}",
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
});
