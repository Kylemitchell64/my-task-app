// cypress/e2e/uncheck-task.cy.js

describe("Uncheck task as complete (E2E – TEST DB)", () => {
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

  it("unchecks a completed task and updates the UI", () => {
    const taskText = `Uncheck me ${Date.now()}`;

    cy.visit(APP_URL);

    // Create task
    cy.get("input").first().type(taskText);
    cy.get('[data-testid="create-button"]').click();

    // Wait for task to render
    cy.get('[data-testid="task-item"]').should("contain.text", taskText);

    // First, mark task as complete
    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .find('[data-testid="task-complete-checkbox"]')
      .click();

    // Verify task is completed
    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .find('[data-testid="task-complete-checkbox"]')
      .should("be.checked");

    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .should("have.class", "completed");

    // Verify completed count is 1
    cy.contains("Completed")
      .parent()
      .find(".stat-value")
      .should("contain", "1");

    // Now uncheck the task
    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .find('[data-testid="task-complete-checkbox"]')
      .click();

    // Verify task is no longer completed
    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .find('[data-testid="task-complete-checkbox"]')
      .should("not.be.checked");

    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .should("not.have.class", "completed");

    // Verify completed count is back to 0
    cy.contains("Completed")
      .parent()
      .find(".stat-value")
      .should("contain", "0");
  });

  it("unchecks a task and verifies completed minutes decrease", () => {
    const taskText = `Uncheck timed task ${Date.now()}`;
    const estimatedMinutes = 30;

    cy.visit(APP_URL);

    // Create task with specific time
    cy.get("input").first().type(taskText);
    cy.get('input[type="number"]').clear().type(estimatedMinutes);
    cy.get('[data-testid="create-button"]').click();

    // Wait for task to render
    cy.get('[data-testid="task-item"]').should("contain.text", taskText);

    // Mark task as complete
    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .find('[data-testid="task-complete-checkbox"]')
      .click();

    // Verify completed minutes increased
    cy.contains("Minutes Done")
      .parent()
      .find(".stat-value")
      .should("contain", estimatedMinutes.toString());

    // Uncheck the task
    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .find('[data-testid="task-complete-checkbox"]')
      .click();

    // Verify completed minutes decreased back to 0
    cy.contains("Minutes Done")
      .parent()
      .find(".stat-value")
      .should("contain", "0");
  });
});