import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { CreateAccountForm } from "@/components/admin/create-account-form";
import { UserActions } from "@/components/admin/user-actions";
import {
  Badge,
  ButtonLink,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  Select,
  StatusPill,
  TableWrap,
  td,
  th,
} from "@/components/ui";
import { formatDateTime, plural } from "@/lib/format";
import { adminContext } from "@/server/context";
import { listUsers, type AccountStatus } from "@/services/admin";
import type { Role } from "@/services/types";

export const metadata: Metadata = { title: "Users" };

const ROLES: Role[] = ["student", "teacher", "admin"];
const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  teacher: "Teacher",
  admin: "Admin",
};
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function UsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const sp = await searchParams;
  const { actor, db, user } = await adminContext();
  const roleRaw = one(sp.role);
  const role = ROLES.includes(roleRaw as Role) ? (roleRaw as Role) : undefined;
  const statusRaw = one(sp.status);
  const status: AccountStatus | undefined =
    statusRaw === "active" || statusRaw === "disabled" ? statusRaw : undefined;
  const q = (one(sp.q) ?? "").slice(0, 100);
  const pageRaw = Number(one(sp.page));
  const list = await listUsers(db, actor, {
    q,
    role,
    status,
    page: Number.isFinite(pageRaw) ? pageRaw : 1,
  });
  const filtered = !!(q || role || status);

  const href = (page: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (role) p.set("role", role);
    if (status) p.set("status", status);
    if (page > 1) p.set("page", String(page));
    const s = p.toString();
    return `/admin/users${s ? `?${s}` : ""}`;
  };
  const from = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.total, list.page * list.pageSize);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="Create teacher, admin and student accounts, reset passwords, and switch accounts off. Disabling signs someone out on their next request and keeps their data."
      />

      <Card className="mb-6" aria-labelledby="create-h">
        <CardHeader
          id="create-h"
          title="Create an account"
          subtitle="You choose a temporary password and pass it on privately. Teachers can sign in straight away."
        />
        <CardBody>
          <CreateAccountForm />
        </CardBody>
      </Card>

      <section aria-labelledby="list-h">
        <h2
          id="list-h"
          className="mb-3 text-xl font-semibold tracking-tight text-ink"
        >
          All accounts
        </h2>
        <Form
          action="/admin/users"
          className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] sm:items-end"
          aria-label="Filter accounts"
        >
          <div className="space-y-1.5">
            <label htmlFor="q" className="block text-sm font-medium text-ink">
              Search name or email
            </label>
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="role"
              className="block text-sm font-medium text-ink"
            >
              Filter by role
            </label>
            <Select id="role" name="role" defaultValue={role ?? ""}>
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="status"
              className="block text-sm font-medium text-ink"
            >
              Filter by status
            </label>
            <Select id="status" name="status" defaultValue={status ?? ""}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary">
              Apply filters
            </Button>
            {filtered && (
              <Link
                href="/admin/users"
                className="text-sm font-semibold text-link underline-offset-2 hover:underline max-sm:py-3"
              >
                Clear
              </Link>
            )}
          </div>
        </Form>

        <p className="mb-3 text-sm text-ink-2" role="status">
          {list.total === 0
            ? "No accounts"
            : `Showing ${from}–${to} of ${plural(list.total, "account")}`}
          {filtered ? " matching your filters" : ""}.
        </p>

        {list.rows.length === 0 ? (
          <EmptyState
            title="No accounts match"
            action={
              <ButtonLink href="/admin/users" variant="secondary">
                Clear filters
              </ButtonLink>
            }
          >
            Try a different name or email, or loosen the role and status
            filters.
          </EmptyState>
        ) : (
          <TableWrap label="Accounts">
            <table className="w-full max-sm:block">
              <caption className="sr-only">Accounts, newest first</caption>
              <thead className="border-b border-border max-sm:sr-only">
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
              <tbody className="divide-y divide-border max-sm:block">
                {list.rows.map((u) => {
                  const self = u.id === user.id;
                  const lastAdmin =
                    u.role === "admin" &&
                    !u.disabledAt &&
                    list.activeAdmins <= 1;
                  const cannotDisable = self
                    ? "You can't disable yourself"
                    : lastAdmin
                      ? "Last active admin"
                      : null;
                  return (
                    <tr
                      key={u.id}
                      className={`max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-1 max-sm:px-1 max-sm:py-3 ${u.disabledAt ? "bg-surface-2/40" : ""}`}
                    >
                      <th
                        scope="row"
                        className={`${td} text-left font-normal max-sm:w-full max-sm:pb-0`}
                      >
                        <p className="font-medium text-ink">
                          {u.name} {self && <Badge tone="brand">You</Badge>}
                        </p>
                        <p className="break-all text-xs text-ink-2">
                          {u.email}
                        </p>
                      </th>
                      <td className={`${td} max-sm:py-1`}>
                        {ROLE_LABEL[u.role]}
                      </td>
                      <td className={`${td} tabular text-right max-sm:hidden`}>
                        {u.role === "admin" ? "—" : u.classes}
                      </td>
                      <td
                        className={`${td} whitespace-nowrap text-ink-2 max-sm:hidden`}
                      >
                        <time dateTime={u.createdAt.toISOString()}>
                          {formatDateTime(u.createdAt, user.timezone)}
                        </time>
                      </td>
                      <td className={`${td} max-sm:py-1`}>
                        {u.disabledAt ? (
                          <StatusPill tone="neutral" label="Disabled" />
                        ) : (
                          <StatusPill tone="good" label="Active" />
                        )}
                      </td>
                      <td
                        className={`${td} text-right max-sm:w-full max-sm:pt-1 max-sm:text-left`}
                      >
                        <UserActions
                          userId={u.id}
                          name={u.name}
                          email={u.email}
                          disabled={!!u.disabledAt}
                          cannotDisable={cannotDisable}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}

        {list.pageCount > 1 && (
          <nav
            aria-label="Pagination"
            className="mt-4 flex items-center justify-between gap-3"
          >
            {list.page > 1 ? (
              <ButtonLink
                href={href(list.page - 1)}
                variant="secondary"
                rel="prev"
              >
                Previous
              </ButtonLink>
            ) : (
              <span />
            )}
            <span className="text-sm text-ink-2">
              Page {list.page} of {list.pageCount}
            </span>
            {list.page < list.pageCount ? (
              <ButtonLink
                href={href(list.page + 1)}
                variant="secondary"
                rel="next"
              >
                Next
              </ButtonLink>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </>
  );
}
