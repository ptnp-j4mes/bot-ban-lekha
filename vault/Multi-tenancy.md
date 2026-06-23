# Multi-tenancy

Up: [[Home]]

Shared DB, **row-level scoping by `org_id`**. Each business = one [[Data Model|Organization]]. The same Postgres holds all tenants; isolation is enforced in the app layer.

## The invariant (do not break)

> Every org-scoped query filters by `ctx.orgId`, and every create sets `orgId`.

`ctx.orgId` comes only from [[Auth & RBAC|authorize()]] (resolved from the `x-org-id` header + membership), **never** from the request body/query.

### Patterns

```ts
// read one
const row = await prisma.foo.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
//   ✗ findUnique({ where: { id } })  ← ignores org → leak

// list / count / updateMany / deleteMany → include orgId in where
// create / createMany → set orgId
// cross-table → scope via relation, e.g. billPlan: { orgId: ctx.orgId }
```

A single missing `where: { orgId }` lets one tenant read or mutate another's data. The [[Home|tenant-guard agent]] (`.claude/agents/tenant-guard.md`) reviews diffs for exactly this.

## What is / isn't scoped

- Scoped: customers, bank accounts, bill plans, installments (via billPlan), payments, submissions, message/audit logs, LINE OA accounts, senders, groups, settings.
- **Not** scoped (global): `BillingCyclePreset`. Managed by super_admin only.

## Tests

`backend/tests/integration.test.ts` includes tenant-isolation checks (member of org A hitting org B → 403; lists only return own org). Keep them green. See [[Dev Workflow]].

Related: [[Auth & RBAC]] · [[Data Model]]
