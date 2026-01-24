const { execSync } = require("child_process");
const path = require("path");

module.exports = () => {
  console.log("🔧 Setting up TEST database (migrations only, no deletes)...");

  // Cypress working directory (you confirmed this)
  const cypressCwd = process.cwd();
  console.log("📍 Cypress working directory:", cypressCwd);

  // Absolute path to TodoApi.csproj
  const apiProjectPath = path.resolve(
    cypressCwd,
    "..",          // -> C:\Users\Kyle\my-task-app
    "TodoApi",
    "TodoApi.csproj"
  );

  console.log("📦 Using API project:", apiProjectPath);

  // Force TEST environment
  process.env.ASPNETCORE_ENVIRONMENT = "Test";

  try {
    execSync(
      `dotnet ef database update --project "${apiProjectPath}"`,
      {
        stdio: "inherit",
      }
    );

    console.log("✅ TEST DB migrations complete");
  } catch (err) {
    console.error("❌ Failed to run EF migrations for TEST DB");
    process.exit(1);
  }
};

// Call the function immediately for manual migration
module.exports();

/**
 * to manually migrate:
 * only after you temporarily switch the test connection string to localhost:
 * cd my-todo-app
 * 
 * node cypress/plugins/setupTestDb.cjs
 * 
 * change connection string back to what it was
 */
