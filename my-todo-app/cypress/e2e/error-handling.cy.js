// cypress/e2e/error-handling.cy.js
//mmocks api errors and verifies error handling in the UI
// tests: failed task creation, failed fetch, failed deletion

describe("Error handling from backend (E2E – TEST DB)", () => {
  const APP_URL = "http://localhost:5001";
  const API_BASE = "http://localhost:5001/api/todotasks";

  it("shows error message when API fails", () => {
    cy.visit(APP_URL);

    // Intercept the API call and force it to fail
    cy.intercept("POST", `${API_BASE}`, {
      statusCode: 500,
      body: { error: "Internal Server Error" },
    }).as("createTaskFail");

    // Try to create a task
    const taskText = `Error task ${Date.now()}`;
    cy.get("input").first().type(taskText);
    cy.get('[data-testid="create-button"]').click();

    // Wait for the failed request
    cy.wait("@createTaskFail");

    // Verify error message is displayed
    cy.get('[data-testid="error-message"]').should("be.visible");
    cy.get('[data-testid="error-message"]').should(
      "contain.text",
      "Failed to add task"
    );

    // Verify task was not added to the UI
    cy.contains(taskText).should("not.exist");
  });

  it("shows error message when fetch fails", () => {
    // Intercept the initial fetch and force it to fail
    cy.intercept("GET", `${API_BASE}`, {
      statusCode: 500,
      body: { error: "Internal Server Error" },
    }).as("fetchTasksFail");

    cy.visit(APP_URL);

    // Wait for the failed request
    cy.wait("@fetchTasksFail");

    // Verify error message is displayed
    cy.get('[data-testid="error-message"]').should("be.visible");
    cy.get('[data-testid="error-message"]').should(
      "contain.text",
      "Failed to load tasks"
    );
  });

  it("shows error message when delete fails", () => {
    cy.visit(APP_URL);

    // Create a task first
    const taskText = `Delete error ${Date.now()}`;
    cy.get("input").first().type(taskText);
    cy.get('[data-testid="create-button"]').click();
    cy.get('[data-testid="task-item"]').should("contain.text", taskText);

    // Intercept the delete request and force it to fail
    cy.intercept("DELETE", `${API_BASE}/*`, {
      statusCode: 500,
      body: { error: "Internal Server Error" },
    }).as("deleteTaskFail");

    // Try to delete the task
    cy.contains(taskText)
      .closest('[data-testid="task-item"]')
      .find('[data-testid="delete-button"]')
      .click();

    // Wait for the failed request
    cy.wait("@deleteTaskFail");

    // Verify error message is displayed
    cy.get('[data-testid="error-message"]').should("be.visible");
    cy.get('[data-testid="error-message"]').should(
      "contain.text",
      "Failed to delete task"
    );

    // Verify task is still in the UI
    cy.contains(taskText).should("be.visible");
  });
});