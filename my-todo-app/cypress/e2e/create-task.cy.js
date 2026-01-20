//("http://localhost:5173") // React dev server


describe("Create task", () => {

  // Runs before each test
  beforeEach(() => {
  // Explicit test-only delete all
  cy.request('DELETE', '/api/todotasks/deleteAll');
});


  it("creates and displays a new task", () => {
    cy.visit("/");

    const taskText = `Test task ${Date.now()}`;

    // Type task title
    cy.get("input").first().type(taskText);

    // Click Add Task button
    cy.get("button").contains(/add|create|submit/i).click();

    // Verify the task appears in the list
    cy.contains(taskText).should("be.visible");

    // Optional: verify backend received the task
    cy.request('/api/todotasks').then((res) => {
      expect(res.body.some(task => task.title === taskText)).to.be.true;
    });
  });

});
