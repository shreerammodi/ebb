"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { flowRouteFor, setFlowNavigator } from "@/lib/commands/flowNav";

/**
 * Registers the live router for commands that run outside React - the keyboard
 * layer and the native menu both dispatch from module scope. Renders nothing;
 * mounted once in the root layout beside the other app-wide hosts.
 */
export default function NavigatorHost() {
    const router = useRouter();

    useEffect(() => {
        // Every route change replaces the history entry. A pushed flow would
        // sit on top of the start screen, where a back swipe, a mouse's back
        // button, or a back chord drops a debater out of a round mid-speech.
        setFlowNavigator({
            openPath: (path) => router.replace(flowRouteFor(path)),
            toStart: () => router.replace("/"),
        });
        return () => setFlowNavigator(null);
    }, [router]);

    return null;
}
