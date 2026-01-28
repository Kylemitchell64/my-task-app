// cypress/e2e/check-task.cy.js

describe("Check task as complete (E2E – TEST DB)", () => {
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

  it("marks a task as complete and updates the UI", () => {
    const taskText = `Complete me ${Date.now()}`;

    cy.visit(APP_URL);

    // Create task
    cy.get("input").first().type(taskText);
    cy.get('[data-testid="create-button"]').click();

    // Wait for task to render
    cy.get('[data-testid="task-item"]').should("contain.text", taskText);

    // Verify initial state - not completed
    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .should("not.have.class", "completed");

    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .find('[data-testid="task-complete-checkbox"]')
      .should("not.be.checked");

    // Mark task as complete
    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .find('[data-testid="task-complete-checkbox"]')
      .click();

    // Verify task is now marked as complete
    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .find('[data-testid="task-complete-checkbox"]')
      .should("be.checked");

    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .should("have.class", "completed");

    // Verify completed count increased to 1
    cy.contains("Completed")
      .parent()
      .find(".stat-value")
      .should("contain", "1");
  });

  it("toggles task completion status", () => {
    const taskText = `Toggle me ${Date.now()}`;

    cy.visit(APP_URL);

    // Create task
    cy.get("input").first().type(taskText);
    cy.get('[data-testid="create-button"]').click();

    // Wait for task to render
    cy.get('[data-testid="task-item"]').should("contain.text", taskText);

    const taskCheckbox = () =>
      cy.contains(taskText)
        .closest('[data-testid="task-item"]')
        .find('[data-testid="task-complete-checkbox"]');

    // Toggle to complete
    taskCheckbox().click();
    taskCheckbox().should("be.checked");

    // Toggle back to incomplete
    taskCheckbox().click();
    taskCheckbox().should("not.be.checked");

    // Toggle to complete again
    taskCheckbox().click();
    taskCheckbox().should("be.checked");
  });
});