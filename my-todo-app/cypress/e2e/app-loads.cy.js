describe("MY-TASK-APP smoke test", () => {
  it("loads the app and shows the task UI", () => {
    cy.visit("/");               // Visits http://localhost:5173

    cy.get("input").should("exist");  // Checks that an input exists
    cy.contains(/task/i);             // Checks for text containing 'task'
  });
});
