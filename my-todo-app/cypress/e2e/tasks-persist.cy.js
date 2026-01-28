// cypress/e2e/tasks-persist.cy.js

describe("Tasks persist after refresh (E2E – TEST DB)", () => {
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

  it("persisting created task after page refresh", () => {
    const taskText = `Persist me ${Date.now()}`;

    cy.visit(APP_URL);

    // Create task
    cy.get("input").first().type(taskText);
    cy.get('[data-testid="create-button"]').click();

    // Wait for task to render
    cy.get('[data-testid="task-item"]').should("contain.text", taskText);

    // Refresh the page
    cy.reload();

    // Verify task still exists after refresh
    cy.get('[data-testid="task-item"]').should("contain.text", taskText);
    cy.contains(taskText).should("be.visible");
  });
});