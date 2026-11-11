using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace TodoApi.Migrations
{
    /// <inheritdoc />
    public partial class LocalFirstSync : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ClientId",
                table: "TodoTasks",
                type: "uuid",
                nullable: false,
                defaultValueSql: "gen_random_uuid()");

            migrationBuilder.AddColumn<DateTime>(
                name: "CompletedAt",
                table: "TodoTasks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "TodoTasks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "DueDate",
                table: "TodoTasks",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Priority",
                table: "TodoTasks",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Repeat",
                table: "TodoTasks",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<double>(
                name: "SortOrder",
                table: "TodoTasks",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "TodoTasks",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.AddColumn<long>(
                name: "Version",
                table: "TodoTasks",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<long>(
                name: "SyncVersion",
                table: "AspNetUsers",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            // Rows that existed before this migration: mark them as version 1 so every device
            // pulls them on its first sync, keep their old order, and give finished tasks a
            // completion time.
            migrationBuilder.Sql("""
                UPDATE "TodoTasks"
                SET "Version" = 1,
                    "SortOrder" = "Id",
                    "UpdatedAt" = date_trunc('milliseconds', "CreatedDate"),
                    "CompletedAt" = CASE WHEN "IsCompleted" THEN "CreatedDate" END;
                UPDATE "AspNetUsers" SET "SyncVersion" = 1;
                """);

            migrationBuilder.CreateTable(
                name: "AuthCodes",
                columns: table => new
                {
                    CodeHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuthCodes", x => x.CodeHash);
                });

            migrationBuilder.CreateTable(
                name: "FocusSessions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    TaskClientId = table.Column<Guid>(type: "uuid", nullable: true),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Seconds = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FocusSessions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RefreshTokens",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    FamilyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UsedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RevokedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RefreshTokens", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TodoTasks_UserId_ClientId",
                table: "TodoTasks",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TodoTasks_UserId_Version",
                table: "TodoTasks",
                columns: new[] { "UserId", "Version" });

            migrationBuilder.CreateIndex(
                name: "IX_FocusSessions_UserId_ClientId",
                table: "FocusSessions",
                columns: new[] { "UserId", "ClientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FocusSessions_UserId_Version",
                table: "FocusSessions",
                columns: new[] { "UserId", "Version" });

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_FamilyId",
                table: "RefreshTokens",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_TokenHash",
                table: "RefreshTokens",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_UserId",
                table: "RefreshTokens",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuthCodes");

            migrationBuilder.DropTable(
                name: "FocusSessions");

            migrationBuilder.DropTable(
                name: "RefreshTokens");

            migrationBuilder.DropIndex(
                name: "IX_TodoTasks_UserId_ClientId",
                table: "TodoTasks");

            migrationBuilder.DropIndex(
                name: "IX_TodoTasks_UserId_Version",
                table: "TodoTasks");

            migrationBuilder.DropColumn(
                name: "ClientId",
                table: "TodoTasks");

            migrationBuilder.DropColumn(
                name: "CompletedAt",
                table: "TodoTasks");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "TodoTasks");

            migrationBuilder.DropColumn(
                name: "DueDate",
                table: "TodoTasks");

            migrationBuilder.DropColumn(
                name: "Priority",
                table: "TodoTasks");

            migrationBuilder.DropColumn(
                name: "Repeat",
                table: "TodoTasks");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "TodoTasks");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "TodoTasks");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "TodoTasks");

            migrationBuilder.DropColumn(
                name: "SyncVersion",
                table: "AspNetUsers");
        }
    }
}
