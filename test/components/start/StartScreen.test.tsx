import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFlowRound } from "@/lib/model/flow";
import { serializeFlow } from "@/lib/persistence/flowFile";
import { serializeRecents } from "@/lib/persistence/recents";
import { useFlowStore } from "@/lib/store/useFlowStore";

import { FLOWS_DIR, HOME, installFakeFlowFs, type FakeFlowFs } from "../../support/fakeFlowFs";

const push = vi.fn();
const stableRouter = { push };
vi.mock("next/navigation", () => ({ useRouter: () => stableRouter }));

const joined: unknown[] = [];
vi.mock("@/lib/collab/inbox", () => ({
    acceptInvite: (notice: unknown) => {
        joined.push(notice);
        return Promise.resolve();
    },
    announceInvite: () => {},
}));

const ran: string[] = [];
vi.mock("@/lib/commands/commands", () => ({
    executeCommand: (id: string) => {
        ran.push(id);
    },
}));

import StartScreen from "@/components/start/StartScreen";
import { useCollabStore } from "@/lib/store/useCollabStore";

let fs: FakeFlowFs;

/** Put a readable flow on the fake disk and list it as recent. */
function seedRecents(paths: string[]) {
    for (const path of paths) {
        const round = makeFlowRound({});
        round.scouting.affSchool = "Westwood";
        round.scouting.aff.first = { first: "Ada", last: "Gray" };
        round.scouting.negSchool = "Harvard";
        round.scouting.neg.first = { first: "Ben", last: "Stone" };
        round.scouting.tournament = "Berkeley";
        fs.files.set(path, serializeFlow(round));
    }
    fs.files.set(
        "/config/recents.json",
        serializeRecents(paths.map((path, i) => ({ path, openedAt: 100 - i }))),
    );
}

beforeEach(() => {
    fs = installFakeFlowFs();
    push.mockReset();
    localStorage.setItem("ebb-idb-migrated", "1");
    useFlowStore.setState({ newFlowOpen: false, settingsOpen: false });
});

describe("StartScreen", () => {
    it("never sweeps the old storage without being asked", async () => {
        // The marker is cleared so the legacy check actually looks; with no old
        // database present nothing should be written and nothing prompted.
        localStorage.removeItem("ebb-idb-migrated");
        render(<StartScreen />);
        await waitFor(() => expect(screen.getByTestId("start-new")).toBeInTheDocument());
        expect(fs.writes).toEqual([]);
        expect(screen.queryByTestId("migration-dialog")).not.toBeInTheDocument();
    });

    it("offers the three commands", async () => {
        render(<StartScreen />);
        expect(screen.getByTestId("start-new")).toHaveTextContent("New flow");
        expect(screen.getByTestId("start-open")).toHaveTextContent("Open");
        expect(screen.getByTestId("start-settings")).toHaveTextContent("Settings");
        await waitFor(() => expect(screen.queryByTestId("start-recent-1")).not.toBeInTheDocument());
    });

    it("labels a recent flow by its matchup and shortens the path", async () => {
        seedRecents([`${FLOWS_DIR}/berkeley.ebb`]);
        render(<StartScreen />);

        const row = await screen.findByTestId("start-recent-1");
        expect(row).toHaveTextContent("Westwood AG vs Harvard BS");
        expect(row).toHaveTextContent("Berkeley");
        expect(row).toHaveTextContent(`${FLOWS_DIR.replace(HOME, "~")}/berkeley.ebb`);
    });

    it("falls back to the filename when a flow will not parse", async () => {
        fs.files.set("/a/broken.ebb", "{ truncated");
        fs.files.set(
            "/config/recents.json",
            serializeRecents([{ path: "/a/broken.ebb", openedAt: 1 }]),
        );

        render(<StartScreen />);

        // The row survives so the user can open it and be told what is wrong.
        expect(await screen.findByTestId("start-recent-1")).toHaveTextContent("broken");
    });

    it("drops a recent whose file is gone", async () => {
        fs.files.set(
            "/config/recents.json",
            serializeRecents([{ path: "/a/vanished.ebb", openedAt: 1 }]),
        );

        render(<StartScreen />);

        await waitFor(() => {
            expect(fs.files.get("/config/recents.json")).not.toContain("vanished");
        });
        expect(screen.queryByTestId("start-recent-1")).not.toBeInTheDocument();
    });

    it("shows at most six recents, each on its own number key", async () => {
        seedRecents(Array.from({ length: 9 }, (_, i) => `${FLOWS_DIR}/r${i}.ebb`));
        render(<StartScreen />);

        await screen.findByTestId("start-recent-1");
        expect(screen.getByTestId("start-recent-6")).toBeInTheDocument();
        expect(screen.queryByTestId("start-recent-7")).not.toBeInTheDocument();
    });

    it("opens a recent by its number key", async () => {
        seedRecents([`${FLOWS_DIR}/a.ebb`, `${FLOWS_DIR}/b.ebb`]);
        render(<StartScreen />);
        await screen.findByTestId("start-recent-2");

        await userEvent.keyboard("2");

        expect(push).toHaveBeenCalledWith(`/flow?path=${encodeURIComponent(`${FLOWS_DIR}/b.ebb`)}`);
    });

    it("opens the New flow prompt on n", async () => {
        render(<StartScreen />);
        await userEvent.keyboard("n");
        expect(useFlowStore.getState().newFlowOpen).toBe(true);
    });

    it("opens Settings on s", async () => {
        render(<StartScreen />);
        await userEvent.keyboard("s");
        expect(useFlowStore.getState().settingsOpen).toBe(true);
    });

    it("walks the column with the arrows and opens the highlighted row with Enter", async () => {
        seedRecents([`${FLOWS_DIR}/a.ebb`]);
        render(<StartScreen />);
        await screen.findByTestId("start-recent-1");

        // Three actions, then the single recent.
        await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");

        expect(push).toHaveBeenCalledWith(`/flow?path=${encodeURIComponent(`${FLOWS_DIR}/a.ebb`)}`);
    });

    it("links out to the docs, the repo, and the author", () => {
        render(<StartScreen />);
        expect(screen.getByRole("link", { name: "Documentation" })).toHaveAttribute(
            "href",
            "https://ebb.smodi.net/docs",
        );
        expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
            "href",
            "https://github.com/shreerammodi/ebb",
        );
        // Only the name is the link; "Developed by" is plain text beside it.
        expect(screen.getByRole("link", { name: "Shreeram Modi" })).toHaveAttribute(
            "href",
            "https://smodi.net",
        );
    });
});

describe("an invitation on the start screen", () => {
    const ALEX = "alex";
    const invite = { endpointId: ALEX, roundId: "r1", label: "Round 3 - Harvard" };

    beforeEach(() => {
        joined.length = 0;
        useCollabStore.setState({ invites: [] });
        useFlowStore.setState({ contacts: { [ALEX]: { name: "Alex" } } });
    });

    it("shows nothing at all when nobody has invited this machine", () => {
        render(<StartScreen />);
        expect(screen.queryByText(/shared/)).not.toBeInTheDocument();
    });

    it("leads the column, naming the partner and the round", () => {
        useCollabStore.setState({ invites: [invite] });
        render(<StartScreen />);
        expect(screen.getByTestId(`start-invite-${ALEX}-r1`)).toHaveTextContent(
            "Alex shared Round 3 - Harvard",
        );
    });

    it("joins nothing until it is chosen", async () => {
        useCollabStore.setState({ invites: [invite] });
        render(<StartScreen />);
        await waitFor(() => expect(screen.getByTestId("start-new")).toBeInTheDocument());
        expect(joined).toEqual([]);
    });

    it("takes the round when it is chosen", async () => {
        useCollabStore.setState({ invites: [invite] });
        render(<StartScreen />);
        await userEvent.click(screen.getByTestId(`start-invite-${ALEX}-r1`));
        expect(joined).toEqual([invite]);
    });

    it("takes the one that has been waiting longest on i", async () => {
        const second = { endpointId: ALEX, roundId: "r2", label: "Round 4" };
        useCollabStore.setState({ invites: [invite, second] });
        render(<StartScreen />);
        await userEvent.keyboard("i");
        expect(joined).toEqual([invite]);
    });
});

describe("joining with a code from the start screen", () => {
    beforeEach(() => {
        ran.length = 0;
        useCollabStore.setState({ invites: [] });
        // A session is an iroh endpoint, which only the shell can bind.
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    });

    afterEach(() => {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    });

    it("sits in the column with the other ways a flow arrives", () => {
        render(<StartScreen />);
        expect(screen.getByTestId("start-join")).toHaveTextContent("Join with a code");
    });

    it("runs the one join command on j, consent question and all", async () => {
        render(<StartScreen />);
        await userEvent.keyboard("j");
        expect(ran).toEqual(["collab.join"]);
    });

    it("is absent off the desktop, where no endpoint can be bound", () => {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
        render(<StartScreen />);
        expect(screen.queryByTestId("start-join")).toBeNull();
    });

    // The static export is prerendered in Node, where no Tauri runtime exists,
    // so anything this screen decides from `window` during render is absent
    // from the server's HTML. React answers a mismatch by throwing the
    // hydrated tree away and rebuilding it, which on a real desktop launch
    // means the first thing a debater sees is a screen that flickers.
    it("hydrates the desktop row without contradicting the prerender", async () => {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
        const html = renderToString(<StartScreen />);
        expect(html).not.toContain("start-join");

        // Only now is there a shell, exactly as the desktop webview arrives:
        // the markup was rendered without one, the hydration runs with one.
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
        const host = document.createElement("div");
        host.innerHTML = html;
        document.body.append(host);
        const recovered: string[] = [];
        await act(async () => {
            hydrateRoot(host, <StartScreen />, {
                onRecoverableError: (err) => recovered.push(String(err)),
            });
        });

        expect(recovered).toEqual([]);
        expect(host.querySelector("[data-testid='start-join']")).not.toBeNull();
    });
});
