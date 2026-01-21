// cypress.config.js
import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5001", // must match your Test backend port
    specPattern: "cypress/e2e/**/*.cy.{js,ts,jsx,tsx}",
    setupNodeEvents(on, config) {
      // ✅ Remove setupTestDb — migrations are already run separately
      return config;
    },
  },
});
