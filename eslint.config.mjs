import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
    ...nextCoreWebVitals,
    { ignores: ["out/**", ".next/**", "src-tauri/**"] },
    {
        rules: {
            // These fire on guarded, keyed synchronizations (load-on-mount,
            // reset-on-close, interval ticks), not the cascading-render loop the
            // rule targets. Keep as a warning rather than blocking the build.
            "react-hooks/set-state-in-effect": "warn",
        },
    },
];

export default eslintConfig;
