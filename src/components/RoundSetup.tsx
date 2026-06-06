"use client";

import { useState } from "react";
import { useRoundStore } from "@/lib/store/useRoundStore";
import { makeFormatByKey } from "@/lib/format/presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Role } from "@/lib/model/types";

export default function RoundSetup() {
  const createRound = useRoundStore((s) => s.createRound);
  const addSheet = useRoundStore((s) => s.addSheet);

  const [role, setRole] = useState<Role>("aff");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createRound({ role, format: makeFormatByKey("policy") });
    addSheet({ title: role === "neg" ? "Neg" : "Aff", group: role === "judge" ? "aff" : role });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <Card className="w-full max-w-[440px]" data-testid="round-setup-form">
        <CardHeader className="pb-0">
          <CardTitle className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase">
            New Round
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-4">
            {/* Role */}
            <fieldset className="flex flex-col gap-2">
              <legend className="font-mono text-[9px] font-bold tracking-widest text-zinc-400 uppercase">
                Role
              </legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Role">
                {(["aff", "neg", "judge"] as Role[]).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={role === r ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                    data-testid={`role-${r}`}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Button>
                ))}
              </div>
            </fieldset>

            <Button type="submit" className="mt-1 self-end" data-testid="submit">
              Start Round
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
