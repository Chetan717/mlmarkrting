# Task Management deployment

The Marketing portal writes directly to the Firestore `Taskm` collection. No Cloud Function is used or required.

Apply `TASK_MANAGEMENT_RULES_UPDATE.md` to the project's existing Firestore rules before deploying the updated panels. The role-based query does not require a new composite index.

Marketing owners always have access. Marketing sub-users need the `taskmanagement` tab and can only query tasks belonging to their own `mteamId`. Master Admin can see all tasks. Other admin-panel users need the `taskmanagement` tab and only receive tasks assigned to their role.

## Task document fields hjvjhjh

- `name`, `taskDate`, `description`, `companyName`, `status`
- `assignedRole`, `assignedRoleKey`
- `createdByMteamId`, `createdByUid`, `createdByName`, `createdByMobile`
- `createdByPanel: "marketing"`
- `assignedPanel: "admin"`
- `createdAt`, `updatedAt`, `updatedByUid`, `updatedByName`, `updatedByPanel`

Valid status values are `Initiated`, `Working`, `Pending`, and `Completed`.

Valid assigned roles are `Master Admin`, `Admin`, `Developer`, `Template Uploader`, and `Designer`.

If a marketing owner wants a sub-user to manage tasks, assign the **Task Management** portal tab from **My Team**.
