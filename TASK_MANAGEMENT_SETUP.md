# Task Management deployment

The Marketing portal writes directly to the Firestore `Taskm` collection. No Cloud Function is used or required.

## Required deployment

Deploy the included Firestore rules and indexes from this project:
hh
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

The same rules are compatible with the updated Admin project. Marketing owners always have access. Marketing sub-users need the `taskmanagement` tab and can only query tasks belonging to their own `mteamId`. Admin users need the `taskmanagement` assigned tab (Master Admin always has access).

## Task document fields

- `name`, `taskDate`, `description`, `companyName`, `status`
- `createdByMteamId`, `createdByUid`, `createdByName`, `createdByMobile`
- `createdByPanel: "marketing"`
- `assignedPanel: "admin"`
- `createdAt`, `updatedAt`, `updatedByUid`, `updatedByName`, `updatedByPanel`

Valid status values are `Initiated`, `Pending`, and `Completed`.

If a marketing owner wants a sub-user to manage tasks, assign the **Task Management** portal tab from **My Team**.
