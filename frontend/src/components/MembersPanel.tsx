import { useEffect, useState, type FormEvent } from "react";
import { boardsApi, type Member } from "@/lib/api";
import { errorMessage } from "@/lib/ui";

type MembersPanelProps = {
  boardId: number;
  isOwner: boolean;
};

export const MembersPanel = ({ boardId, isOwner }: MembersPanelProps) => {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    boardsApi
      .members(boardId)
      .then(setMembers)
      .catch(() => setError("Unable to load members."));
  }, [boardId]);

  const run = async (request: Promise<Member[]>) => {
    try {
      setError("");
      setMembers(await request);
      return true;
    } catch (err) {
      setError(errorMessage(err, "Unable to update members."));
      return false;
    }
  };

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = username.trim();
    if (name && (await run(boardsApi.addMember(boardId, name)))) {
      setUsername("");
    }
  };

  return (
    <section
      aria-label="Members"
      className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4"
    >
      <ul className="space-y-2">
        {members?.map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-[var(--navy-dark)]">{member.username}</span>
            <span className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-wide text-[var(--gray-text)]">
                {member.role}
              </span>
              {isOwner && member.role === "member" ? (
                <button
                  type="button"
                  onClick={() => run(boardsApi.removeMember(boardId, member.id))}
                  aria-label={`Remove ${member.username}`}
                  className="text-xs font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                >
                  Remove
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form onSubmit={handleAdd} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            aria-label="Share with username"
            className="w-40 rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            className="rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Share
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
};
