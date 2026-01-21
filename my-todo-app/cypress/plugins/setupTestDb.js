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


/**
 * to manually migrate:
 * only after you temporarily switch the connection string to localhost:
 * node cypress/plugins/setupTestDb.js
 */
