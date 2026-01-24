describe("Delete single task (E2E – TEST DB)", () => {
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

  it("deletes a task from the UI", () => {
  const taskText = `Delete me ${Date.now()}`;

  cy.visit(APP_URL);

  // create task (same logic as create-task.cy.js)
  cy.get("input").first().type(taskText);
  cy.get('[data-testid="create-button"]').click();

  // wait for task to render
  cy.get('[data-testid="task-item"]').should("contain.text", taskText);

  // delete the correct task
  cy.contains(taskText)
    .closest('[data-testid="task-item"]')
    .find('[data-testid="delete-button"]')
    .click();

  // assert task is gone
  cy.contains(taskText).should("not.exist");
});

});
