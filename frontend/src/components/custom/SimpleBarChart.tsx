import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTheme } from "@/hooks/useTheme";

// ... imports ...

export interface BarSeries {
    key: string;
    label: string;
    color: string;
    stackId?: string;
}

export interface BarChartDataPoint {
    name: string;
    [key: string]: string | number;
}

interface SimpleBarChartProps {
    data: BarChartDataPoint[];
    xLabel?: string;
    yLabel?: string;
    series?: BarSeries[];
}

export const SimpleBarChart: React.FC<SimpleBarChartProps> = ({ data, xLabel, yLabel, series }) => {
    const { theme, systemTheme } = useTheme();
    const isDarkMode = (theme === "system" ? systemTheme : theme) === "dark";

    const ampColor = isDarkMode ? "#60a5fa" : "#3b82f6";
    const phiColor = isDarkMode ? "#fb923c" : "#f97316";
    const textColor = isDarkMode ? "#9ca3af" : "#4b5563";
    const gridColor = isDarkMode ? "#374151" : "#e5e7eb";
    const borderColor = isDarkMode ? "#e0e0e0" : "#404040";

    const defaultSeries: BarSeries[] = [
        { key: 'Amplitude', label: 'Amplitude', color: ampColor },
        { key: 'Phase', label: 'Phase', color: phiColor },
    ];

    const activeSeries = series || defaultSeries;

    return (
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    barGap={0}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis
                        dataKey="name"
                        stroke={textColor}
                        tickLine={false}
                        label={{ value: xLabel, position: 'insideBottom', offset: -10, fill: textColor }}
                    />
                    <YAxis
                        stroke={textColor}
                        tickLine={false}
                        label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: textColor }}
                    />
                    <Tooltip
                        formatter={(value: string | number) => typeof value === 'number' ? value.toFixed(2) : value}
                        contentStyle={{
                            backgroundColor: isDarkMode ? '#1f2937' : '#fff',
                            borderColor: gridColor,
                            color: textColor
                        }}
                        itemStyle={{ color: textColor }}
                        cursor={{ fill: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                    {activeSeries.map(s => (
                        <Bar
                            key={s.key}
                            dataKey={s.key}
                            name={s.label}
                            fill={s.color}
                            stroke={borderColor}
                            strokeWidth={1}
                            stackId={s.stackId}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
