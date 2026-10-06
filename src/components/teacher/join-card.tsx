"use client";

import { useSyncExternalStore } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { CopyButton } from "./copy-button";

const subscribe = () => () => {};
const origin = () => window.location.origin;

/** Join code plus a ready-made sign-up link (the register page pre-fills `?code=`). */
export function JoinCard({ joinCode }: { joinCode: string }) {
  const base = useSyncExternalStore(subscribe, origin, () => "");
  const link = `${base}/register?code=${encodeURIComponent(joinCode)}`;
  return (
    <Card aria-labelledby="join-h">
      <CardHeader
        id="join-h"
        title="Invite students"
        subtitle="Students create their account with this code and land straight in the class."
      />
      <CardBody className="space-y-4">
        <div>
          <p className="text-sm font-medium text-ink">Join code</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <span
              className="rounded-[10px] border border-border-strong bg-surface-2 px-4 py-2 font-mono text-2xl font-bold tracking-[0.25em] text-ink"
              aria-label={`Join code ${joinCode.split("").join(" ")}`}
            >
              {joinCode}
            </span>
            <CopyButton text={joinCode} aria-label="Copy join code">
              Copy code
            </CopyButton>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-ink">Sign-up link</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <code className="min-w-0 max-w-full break-all rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">
              {link}
            </code>
            <CopyButton
              text={() =>
                `${window.location.origin}/register?code=${encodeURIComponent(joinCode)}`
              }
              aria-label="Copy sign-up link"
            >
              Copy link
            </CopyButton>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
