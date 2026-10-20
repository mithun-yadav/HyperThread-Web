"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  createConversationSchema,
  type CreateConversationInput,
} from "@/features/chat/chat-contract";

export function CreateConversationDialog({
  currentUserId,
  onCreate,
}: {
  currentUserId: string;
  onCreate: (input: CreateConversationInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"DIRECT" | "GROUP">("DIRECT");
  const [recipientId, setRecipientId] = useState("");
  const [name, setName] = useState("");
  const [memberIds, setMemberIds] = useState(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    setMode("DIRECT");
    setRecipientId("");
    setName("");
    setMemberIds(["", ""]);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const candidate =
      mode === "DIRECT"
        ? { type: mode, recipientId: recipientId.trim() }
        : {
            type: mode,
            name: name.trim(),
            memberIds: memberIds.map((id) => id.trim()),
          };
    const parsed = createConversationSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(
        mode === "DIRECT"
          ? "Enter a valid recipient UUID."
          : "Enter a 2–50 character name and at least two unique member UUIDs.",
      );
      return;
    }
    const normalizedCurrentUserId = currentUserId.toLowerCase();
    if (
      (parsed.data.type === "DIRECT" &&
        parsed.data.recipientId.toLowerCase() === normalizedCurrentUserId) ||
      (parsed.data.type === "GROUP" &&
        parsed.data.memberIds.some(
          (memberId) => memberId.toLowerCase() === normalizedCurrentUserId,
        ))
    ) {
      setError("Use IDs for other users; your own ID is added automatically.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onCreate(parsed.data);
      setOpen(false);
      reset();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Conversation creation failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && !pending) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon-lg" aria-label="New conversation">
          <PlusIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New conversation</DialogTitle>
            <DialogDescription>
              Start a direct thread or bring a group together using their user
              IDs.
            </DialogDescription>
          </DialogHeader>

          <div
            className="bg-muted my-6 grid grid-cols-2 gap-2 rounded-xl p-1"
            role="group"
            aria-label="Conversation type"
          >
            <Button
              type="button"
              variant={mode === "DIRECT" ? "secondary" : "ghost"}
              aria-pressed={mode === "DIRECT"}
              onClick={() => setMode("DIRECT")}
            >
              Direct
            </Button>
            <Button
              type="button"
              variant={mode === "GROUP" ? "secondary" : "ghost"}
              aria-pressed={mode === "GROUP"}
              onClick={() => setMode("GROUP")}
            >
              <UsersIcon /> Group
            </Button>
          </div>

          {mode === "DIRECT" ? (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="recipient-id">Recipient user ID</FieldLabel>
              <Input
                id="recipient-id"
                value={recipientId}
                onChange={(event) => setRecipientId(event.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                autoComplete="off"
              />
            </Field>
          ) : (
            <div className="space-y-5">
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="group-name">Group name</FieldLabel>
                <Input
                  id="group-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Design crew"
                  maxLength={50}
                />
              </Field>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Member user IDs</legend>
                {memberIds.map((memberId, index) => (
                  <div className="flex gap-2" key={index}>
                    <Input
                      aria-label={`Member ${index + 1} user ID`}
                      value={memberId}
                      onChange={(event) =>
                        setMemberIds((current) =>
                          current.map((id, itemIndex) =>
                            itemIndex === index ? event.target.value : id,
                          ),
                        )
                      }
                      placeholder="User UUID"
                      autoComplete="off"
                    />
                    {memberIds.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove member ${index + 1}`}
                        onClick={() =>
                          setMemberIds((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMemberIds((current) => [...current, ""])}
                >
                  <PlusIcon /> Add member
                </Button>
              </fieldset>
            </div>
          )}
          <FieldError className="mt-4">{error}</FieldError>

          <DialogFooter className="mt-7">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {pending ? "Creating…" : "Create conversation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
