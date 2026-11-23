# Database schema (Cloud Firestore)

One Firestore collection per model (lower-case plural: `leads`, `auditlogs`, `supporttickets`, …). Document id = `_id` (24-char hex; Firebase uid for `users`). Schemas are declared with the Mongoose-style API of `core/db/odm.js`.

All business collections have `createdAt/updatedAt`. Important records are soft-deleted with `isArchived`.

| Model | Purpose / key fields |
|---|---|
| **User** | `name,email,role(admin|client),adminSlot(1-4),clientId,failedLoginAttempts,lockUntil,lastLogin*,passwordChangedAt`. The 4 admin emails are enforced by firestore.rules. `forcedOutAt` signs out older logins. Passwords live in Firebase Auth (uid = `_id`). |
| **Session** | `user,audience,ip,device,userAgent,lastSeenAt,expiresAt,revokedAt,revokedBy,endReason,purgeAt` (TTL field). Checked on every request (force-logout). |
| **AuditLog** | `adminId,adminName,adminEmail,actorType,action,module,recordId,description,oldValues,newValues,ip,device,createdAt`. Append-only (hooks block update/delete); secrets scrubbed. Indexed on module/action/admin/createdAt. |
| **Lead** | contact + project enquiry fields, `status,source,priority,assignedTo,communications[],convertedClient/Project,isArchived`. Saved before any email is attempted; `emailStatus` fields record failures. |
| **Client** | `company,contactPerson,email,phone,address,gstin,type,notes,portalUser,isArchived` |
| **Project** | `projectId,name,client,status,category,progress,dates,techStack,acceptedAmount,amountReceived,totalExpenses,profit,pendingBalance,handoverChecklist[],changeRequests[],feedback[],contributions[],certificate{number,issuedAt,file,confirmedBy},portfolio{show,summary,…}` |
| **Task / Milestone** | kanban status, assignee, due date, comments; milestones carry optional payment amount |
| **Quotation** | `number,revision,client/clientSnapshot,items[],discount,tax,grandTotal,advance,milestonePayments[],status(Draft→Sent→Viewed→Accepted/Rejected/Expired),viewToken,viewedAt,showInPortal` |
| **Invoice** | `number,items,totals,amountPaid,balance,status,dueDate,quotation,project` (balance derived from confirmed payments only) |
| **Payment** | `receiptNumber,invoice,project,client,amount,method,paidOn,status(confirmed|voided),voidReason`. Never deleted, only voided. |
| **Expense** | category, amount, date, project?, receipt file, `isArchived` |
| **Document** | metadata + `storageKey(select:false)`, `visibleToClient`, category, owner links |
| **Notification** | `type,title,link,readBy[],dedupeKey` |
| **SupportTicket** | `number,client,project,status,priority,replies[]` |
| **Settings** | singleton: agency profile, defaults, `testimonials[],publicTeam[],blogPosts[],social` |
| **Counter** | atomic sequences for QT/INV/RC/PRJ/CL/CERT/TKT numbers |

## Copies readable without admin rights (written by admins' browsers)

| Path | Who can read | Content |
|---|---|---|
| `public/site`, `public/blog`, `public/portfolio` | anyone | website content (`json` text) |
| `portal/{clientId}` + `portal/{clientId}/items/{key}` | that client | overview, tickets, project detail, quotation/invoice data for PDFs; `fileKeys` = files the client may download |
| `quotationViews/{token}` | anyone with the token | quotation summary; a visitor may set `viewedAt` once |
| `portalInbox/{id}` | the client who wrote it, admins | client submissions waiting for the CRM |
| `files/{key}`, `filechunks/{key__n}` | admins; a client only for keys in their `fileKeys` | stored files (700 KB chunks) |
| `_meta/*` | admins | reminder lock, mirror hashes, audit filter values |
