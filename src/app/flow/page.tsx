import { Suspense } from "react";

import AppRoot from "@/components/flow/AppRoot";

export default function FlowPage() {
    return (
        <Suspense fallback={null}>
            <AppRoot />
        </Suspense>
    );
}
