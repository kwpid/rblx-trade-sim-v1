import { useState, useEffect } from 'react'
import axios from 'axios'
import {
    ComposedChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer
} from 'recharts'

const ItemTooltipGraph = ({ itemId }) => {
    const [data, setData] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [rapRes, valRes] = await Promise.all([
                    axios.get(`/api/items/${itemId}/rap-history`),
                    axios.get(`/api/items/value-changes?item_id=${itemId}`)
                ])

                // Process RAP
                const rapMap = new Map();
                (rapRes.data || []).forEach(r => {
                    const date = new Date(r.snapshot_date || r.timestamp).toLocaleDateString();
                    rapMap.set(date, { date, rap: r.rap_value });
                });

                // Process Value
                const valData = valRes.data?.data || []
                valData.forEach(v => {
                    const date = new Date(v.created_at).toLocaleDateString();
                    if (rapMap.has(date)) {
                        rapMap.get(date).value = v.new_value;
                    } else {
                        rapMap.set(date, { date, value: v.new_value });
                    }
                });

                // Sort by date
                const sortedData = Array.from(rapMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));

                // Advanced gap filling to ensure "real data" continuity
                let currentRap = 0;
                let currentValue = 0;

                // Find first known values to initialize
                const firstWithRap = sortedData.find(d => d.rap !== undefined);
                const firstWithValue = sortedData.find(d => d.value !== undefined);
                currentRap = firstWithRap ? firstWithRap.rap : 0;
                currentValue = firstWithValue ? firstWithValue.value : 0;

                const filledData = sortedData.map(d => {
                    if (d.rap !== undefined) currentRap = d.rap;
                    if (d.value !== undefined) currentValue = d.value;
                    return {
                        ...d,
                        rap: currentRap,
                        value: currentValue
                    };
                });

                setData(filledData.slice(-14)); // Last 14 snapshots (approx 2 weeks if daily)
            } catch (err) {
                console.error("Graph fetch error", err);
            } finally {
                setLoading(false)
            }
        }

        if (itemId) fetchData()
    }, [itemId])

    if (loading) return <div className="tooltip-loading">Loading graph...</div>
    if (data.length === 0) return <div className="tooltip-nodata">No data</div>

    const latest = data[data.length - 1] || {}

    return (
        <div className="item-tooltip-graph" style={{
            backgroundColor: 'rgba(5, 5, 5, 0.95)',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid #444',
            boxShadow: '0 8px 30px rgba(0,0,0,0.8)',
            minWidth: '240px',
            color: '#fff',
            fontFamily: 'sans-serif',
            pointerEvents: 'none' // Ensure the tooltip never blocks mouse events
        }}>
            <div className="graph-header" style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', borderBottom: '1px solid #333', paddingBottom: '5px', marginBottom: '8px' }}>
                    Value History (14 Days)
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#00b06f' }}>Value: ${latest.value?.toLocaleString() || '---'}</span>
                    <span style={{ color: '#00a2ff' }}>RAP: ${latest.rap?.toLocaleString() || '---'}</span>
                </div>
            </div>

            <ResponsiveContainer width="100%" height={100}>
                <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#111', border: '1px solid #444', fontSize: '10px', color: '#fff' }}
                        itemStyle={{ color: '#fff', padding: '2px 0' }}
                        cursor={{ stroke: '#555', strokeWidth: 1 }}
                    />
                    <Line
                        type="monotone"
                        dataKey="rap"
                        stroke="#00a2ff"
                        dot={{ r: 3, fill: '#00a2ff', strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        strokeWidth={2.5}
                        name="RAP"
                    />
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#00b06f"
                        dot={{ r: 3, fill: '#00b06f', strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        strokeWidth={2.5}
                        name="Value"
                    />
                </ComposedChart>
            </ResponsiveContainer>

            <div className="graph-footer" style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '10px', fontSize: '10px', opacity: 0.8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00a2ff' }}></div>
                    RAP
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00b06f' }}></div>
                    Value
                </div>
            </div>
        </div>
    )
}

export default ItemTooltipGraph
