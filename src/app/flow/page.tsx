import { Suspense } from "react";

import AppRoot from "@/components/AppRoot";

export default function FlowPage() {
    return (
        <Suspense fallback={null}>
            <AppRoot />
        </Suspense>
    );
}
