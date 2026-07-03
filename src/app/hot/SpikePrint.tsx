import { SPEECHES, type SpikeMeta } from "./SpikeGrid";

export default function SpikePrint({ data, meta }: { data: (string | null)[][]; meta: SpikeMeta }) {
    return (
        <div className="spike-print">
            <table>
                <thead>
                    <tr>
                        {SPEECHES.map((s) => (
                            <th key={s}>{s}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, r) => (
                        <tr key={r}>
                            {row.map((cell, c) => {
                                const m = meta[`${r},${c}`];
                                return (
                                    <td
                                        key={c}
                                        className={[
                                            m?.bold ? "spike-bold" : "",
                                            m?.highlight ? "spike-highlight" : "",
                                        ]
                                            .filter(Boolean)
                                            .join(" ")}
                                    >
                                        {cell ?? ""}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
