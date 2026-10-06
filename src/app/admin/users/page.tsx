import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { CreateStaffForm } from "@/components/admin/create-staff-form";
import { UserStatusToggle } from "@/components/admin/user-status-toggle";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, PageHeader, Select, StatusPill, TableWrap, td, th } from "@/components/ui";
import { formatDateTime, plural } from "@/lib/format";
import { adminContext } from "@/server/context";
import { listUsers } from "@/services/admin";
import type { Role } from "@/services/types";

export const metadata: Metadata = { title: "Users" };

type Search = Promise<{ role?: string | string[]; q?: string | string[] }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const ROLES: Role[] = ["student", "teacher", "admin"];
const ROLE_LABEL: Record<Role, string> = { student: "Student", teacher: "Teacher", admin: "Admin" };

export default async function UsersPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { actor, db, user } = await adminContext();
  const roleRaw = one(sp.role);
  const role = ROLES.includes(roleRaw as Role) ? (roleRaw as Role) : undefined;
  const q = (one(sp.q) ?? "").slice(0, 100);
  const rows = await listUsers(db, actor, { role, q });
  const filtered = !!role || !!q;

  return (
    <>
      <PageHeader eyebrow="Admin" title="Users" description="Staff accounts and access. Disabling an account signs that person out on their next request." />

      <Card className="mb-6" aria-labelledby="create-h">
        <CardHeader id="create-h" title="Create a staff account" />
        <CardBody>
          <CreateStaffForm />
        </CardBody>
      </Card>

      <section aria-labelledby="list-h">
        <h2 id="list-h" className="mb-3 text-lg font-semibold text-ink">
          All accounts
        </h2>
        <Form action="/admin/users" className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filter accounts">
          <div className="space-y-1.5">
            <label htmlFor="q" className="block text-sm font-medium text-ink">
              Search name or email
            </label>
            <Input id="q" name="q" type="search" defaultValue={q} className="w-full sm:w-72" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="role" className="block text-sm font-medium text-ink">
              Role
            </label>
            <Select id="role" name="role" defaultValue={role ?? ""} className="w-40">
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {filtered && (
            <Link href="/admin/users" className="pb-2 text-sm font-medium text-brand hover:underline">
              Clear filters
            </Link>
          )}
        </Form>

        <p className="mb-3 text-sm text-ink-2" role="status">
          {plural(rows.length, "account")}
          {filtered ? " match" : ""}.{rows.length >= 1000 ? " Showing the first 1,000; narrow the search." : ""}
        </p>

        {rows.length === 0 ? (
          <EmptyState title="No accounts match">Try a different search.</EmptyState>
        ) : (
          <TableWrap label="Accounts">
            <table className="w-full">
              <caption className="sr-only">Accounts</caption>
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className={th}>
                    Name
                  </th>
                  <th scope="col" className={th}>
                    Role
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    Classes
                  </th>
                  <th scope="col" className={th}>
                    Created
                  </th>
                  <th scope="col" className={th}>
                    Status
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((u) => {
                  const self = u.id === user.id;
                  return (
                    <tr key={u.id} className={u.disabledAt ? "text-ink-2" : undefined}>
                      <th scope="row" className={`${td} text-left font-normal`}>
                        <p className="font-medium text-ink">
                          {u.name} {self && <Badge tone="brand">You</Badge>}
                        </p>
                        <p className="text-xs text-ink-2">{u.email}</p>
                      </th>
                      <td className={td}>{ROLE_LABEL[u.role]}</td>
                      <td className={`${td} tabular text-right`}>{u.role === "admin" ? "—" : u.classes}</td>
                      <td className={`${td} whitespace-nowrap text-ink-2`}>
                        <time dateTime={u.createdAt.toISOString()}>{formatDateTime(u.createdAt, user.timezone)}</time>
                      </td>
                      <td className={td}>{u.disabledAt ? <StatusPill tone="neutral" label="Disabled" /> : <StatusPill tone="good" label="Active" />}</td>
                      <td className={`${td} text-right`}>
                        {self ? (
                          <span className="text-xs text-ink-2">Can&apos;t disable yourself</span>
                        ) : (
                          <UserStatusToggle userId={u.id} name={u.name} disabled={!!u.disabledAt} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>
    </>
  );
}
