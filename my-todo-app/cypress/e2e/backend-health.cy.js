describe("Backend health", () => {
  it("API health endpoint returns 200", () => {
    cy.request("/api/diagnostic/health")
      .its("status")
      .should("eq", 200);
  });
});
