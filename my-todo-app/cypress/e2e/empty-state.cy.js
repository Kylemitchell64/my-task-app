// cypress/e2e/empty-state.cy.js

describe("Empty state behavior (E2E – TEST DB)", () => {
  const APP_URL = "http://localhost:5001";
  const API_BASE = "http://localhost:5001/api/todotasks";
  const DELETE_ALL_ENDPOINT = `${API_BASE}/deleteAll`;

  const deleteAllTasks = () => {
    return cy.request({
      method: "DELETE",
      url: DELETE_ALL_ENDPOINT,
      failOnStatusCode: false,
    });
  };

  before(() => {
    deleteAllTasks();
  });

  it("shows empty state message when no tasks exist", () => {
    cy.visit(APP_URL);

    // Verify empty state message is visible
    cy.get('[data-testid="empty-state"]').should("be.visible");
    cy.get('[data-testid="empty-state"]').should(
      "contain.text",
      "No tasks yet"
    );

    // Verify no task items are displayed
    cy.get('[data-testid="task-item"]').should("not.exist");
  });
});