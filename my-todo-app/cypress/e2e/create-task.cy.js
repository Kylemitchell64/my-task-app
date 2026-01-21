// cypress/e2e/create-task.cy.js

describe("Create task (E2E – TEST DB)", () => {
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
    deleteAllTasks(); // now Cypress waits
  });

  it("creates and displays a new task", () => {
    const taskText = `Test task ${Date.now()}`;

    cy.visit(APP_URL);

    cy.get("input").first().type(taskText);
    cy.get("button")
      .contains(/add|create|submit/i)
      .click();

    cy.contains(taskText).should("be.visible");
  });
});
