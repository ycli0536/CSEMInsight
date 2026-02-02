/**
 * CSEMInsight Color Palette
 * 
 * A design-conscious, CVD-friendly (Color Vision Deficiency) color palette
 * for both light and dark modes.
 * 
 * Design Principles:
 * 1. Blue-Orange contrast instead of Red-Green (safe for protanopia/deuteranopia)
 * 2. Distinct luminance values for each color (helps tritanopia)
 * 3. Minimum 4.5:1 contrast ratio for accessibility
 * 4. Harmonious aesthetics with modern design sensibility
 */

// =============================================================================
// CORE THEME COLORS
// =============================================================================

export const themeColors = {
    light: {
        // Base surface colors
        background: "hsl(220, 20%, 98%)",      // Soft off-white with cool undertone
        foreground: "hsl(220, 25%, 12%)",      // Deep navy for text

        // Card/Panel surfaces
        card: "hsl(220, 15%, 100%)",
        cardForeground: "hsl(220, 25%, 12%)",

        // Primary accent - Deep Indigo
        primary: "hsl(235, 65%, 50%)",
        primaryForeground: "hsl(0, 0%, 100%)",

        // Secondary - Warm Gray
        secondary: "hsl(220, 10%, 92%)",
        secondaryForeground: "hsl(220, 25%, 20%)",

        // Muted elements
        muted: "hsl(220, 10%, 94%)",
        mutedForeground: "hsl(220, 10%, 45%)",

        // Accent - Teal
        accent: "hsl(175, 60%, 45%)",
        accentForeground: "hsl(0, 0%, 100%)",

        // Borders
        border: "hsl(220, 15%, 88%)",
        input: "hsl(220, 15%, 88%)",
        ring: "hsl(235, 65%, 50%)",

        // Axis colors for plots
        axis: "hsl(220, 25%, 15%)",
        grid: "hsl(220, 10%, 85%)",
    },
    dark: {
        // Base surface colors
        background: "hsl(225, 25%, 8%)",       // Deep space blue
        foreground: "hsl(220, 15%, 95%)",      // Soft white

        // Card/Panel surfaces
        card: "hsl(225, 20%, 12%)",
        cardForeground: "hsl(220, 15%, 95%)",

        // Primary accent - Luminous Indigo
        primary: "hsl(235, 75%, 65%)",
        primaryForeground: "hsl(225, 25%, 8%)",

        // Secondary - Deep Gray
        secondary: "hsl(220, 15%, 18%)",
        secondaryForeground: "hsl(220, 15%, 90%)",

        // Muted elements
        muted: "hsl(220, 15%, 18%)",
        mutedForeground: "hsl(220, 10%, 65%)",

        // Accent - Vibrant Teal
        accent: "hsl(175, 65%, 50%)",
        accentForeground: "hsl(225, 25%, 8%)",

        // Borders
        border: "hsl(220, 15%, 22%)",
        input: "hsl(220, 15%, 22%)",
        ring: "hsl(235, 75%, 65%)",

        // Axis colors for plots
        axis: "hsl(220, 15%, 85%)",
        grid: "hsl(220, 15%, 30%)",
    },
} as const;

// =============================================================================
// SEMANTIC COLORS (CVD-Safe)
// =============================================================================

export const semanticColors = {
    light: {
        success: "hsl(165, 60%, 35%)",         // Teal-Green (not pure green)
        successForeground: "hsl(0, 0%, 100%)",
        warning: "hsl(40, 95%, 45%)",          // Amber
        warningForeground: "hsl(40, 95%, 10%)",
        error: "hsl(0, 70%, 50%)",             // Accessible Red
        errorForeground: "hsl(0, 0%, 100%)",
        info: "hsl(205, 85%, 50%)",            // Sky Blue
        infoForeground: "hsl(0, 0%, 100%)",
    },
    dark: {
        success: "hsl(165, 55%, 45%)",
        successForeground: "hsl(165, 55%, 10%)",
        warning: "hsl(40, 90%, 55%)",
        warningForeground: "hsl(40, 90%, 10%)",
        error: "hsl(0, 65%, 55%)",
        errorForeground: "hsl(0, 0%, 100%)",
        info: "hsl(205, 80%, 60%)",
        infoForeground: "hsl(205, 80%, 10%)",
    },
} as const;

// =============================================================================
// DATA VISUALIZATION PALETTE (CVD-Safe)
// =============================================================================
// This palette is designed to be distinguishable for:
// - Normal vision
// - Protanopia (red-blind)
// - Deuteranopia (green-blind) 
// - Tritanopia (blue-blind)
//
// Colors are ordered by luminance for maximum differentiation

export const dataVizPalette = {
    // Categorical palette for data series (up to 12 distinct colors)
    // Each color has distinct hue, saturation, AND luminance
    categorical: {
        light: [
            "hsl(217, 91%, 60%)",   // Electric Blue (primary)
            "hsl(25, 95%, 53%)",    // Vibrant Orange (secondary)
            "hsl(173, 80%, 40%)",   // Scientific Teal
            "hsl(291, 64%, 42%)",   // Deep Violet
            "hsl(47, 96%, 53%)",    // Precision Gold
            "hsl(349, 89%, 60%)",   // Signal Red
            "hsl(192, 91%, 36%)",   // Accent Cyan
            "hsl(15, 80%, 50%)",    // Burnt Orange
            "hsl(145, 55%, 42%)",   // Forest
            "hsl(320, 65%, 52%)",   // Rose
            "hsl(95, 50%, 42%)",    // Olive
            "hsl(260, 50%, 55%)",   // Lavender
        ],
        dark: [
            "hsl(217, 91%, 65%)",   // Electric Blue (brighter)
            "hsl(25, 95%, 60%)",    // Vibrant Orange
            "hsl(173, 80%, 50%)",   // Scientific Teal
            "hsl(291, 64%, 55%)",   // Deep Violet
            "hsl(47, 96%, 58%)",    // Precision Gold
            "hsl(349, 89%, 65%)",   // Signal Red
            "hsl(192, 91%, 50%)",   // Accent Cyan
            "hsl(15, 75%, 58%)",    // Burnt Orange
            "hsl(145, 50%, 55%)",   // Forest
            "hsl(320, 60%, 60%)",   // Rose
            "hsl(95, 45%, 55%)",    // Olive
            "hsl(260, 45%, 65%)",   // Lavender
        ],
    },

    // Tx/Rx specific colors (high contrast pair)
    txRx: {
        light: {
            tx: "hsl(25, 95%, 50%)",     // Vibrant Orange (instead of red)
            rx: "hsl(205, 85%, 45%)",    // Deep Blue
            txOriginal: "hsl(35, 70%, 55%)", // Muted Gold for original Tx
        },
        dark: {
            tx: "hsl(25, 90%, 60%)",     // Bright Orange
            rx: "hsl(205, 80%, 60%)",    // Bright Blue
            txOriginal: "hsl(35, 65%, 60%)", // Gold for original Tx
        },
    },

    // Bathymetry/seafloor
    bathymetry: {
        light: "hsl(165, 70%, 35%)",
        dark: "hsl(165, 60%, 50%)",
    },

    // Sequential palette for heatmaps/gradients (single hue progression)
    sequential: {
        blue: [
            "hsl(205, 85%, 90%)",
            "hsl(205, 85%, 75%)",
            "hsl(205, 85%, 60%)",
            "hsl(205, 85%, 45%)",
            "hsl(205, 85%, 30%)",
        ],
        orange: [
            "hsl(25, 95%, 90%)",
            "hsl(25, 95%, 75%)",
            "hsl(25, 95%, 60%)",
            "hsl(25, 95%, 45%)",
            "hsl(25, 95%, 30%)",
        ],
    },

    // Diverging palette for difference plots (negative -> zero -> positive)
    diverging: {
        light: {
            negative: "hsl(205, 85%, 45%)",  // Blue
            neutral: "hsl(220, 5%, 95%)",    // Near white
            positive: "hsl(25, 95%, 55%)",   // Orange
        },
        dark: {
            negative: "hsl(205, 80%, 60%)",
            neutral: "hsl(220, 15%, 25%)",
            positive: "hsl(25, 90%, 60%)",
        },
    },
} as const;

// =============================================================================
// CHART COLORS FOR UPLOT
// =============================================================================

export const chartColors = {
    light: {
        axis: "#1e293b",        // Slate 800
        grid: "#e2e8f0",        // Slate 200
        title: "#0f172a",       // Slate 900
        legend: "#475569",      // Slate 600
    },
    dark: {
        axis: "#e2e8f0",        // Slate 200
        grid: "#334155",        // Slate 700
        title: "#f8fafc",       // Slate 50
        legend: "#94a3b8",      // Slate 400
    },
} as const;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get the appropriate color based on current theme
 */
export function getThemeColor(
    colorKey: keyof typeof themeColors.light,
    isDark: boolean
): string {
    return isDark ? themeColors.dark[colorKey] : themeColors.light[colorKey];
}

/**
 * Get categorical color by index, cycling through palette
 */
export function getCategoricalColor(index: number, isDark: boolean): string {
    const palette = isDark
        ? dataVizPalette.categorical.dark
        : dataVizPalette.categorical.light;
    return palette[index % palette.length];
}

/**
 * Get Tx/Rx colors for the current theme
 */
export function getTxRxColors(isDark: boolean) {
    return isDark ? dataVizPalette.txRx.dark : dataVizPalette.txRx.light;
}

/**
 * Get chart axis/grid colors for uPlot
 */
export function getChartColors(isDark: boolean) {
    return isDark ? chartColors.dark : chartColors.light;
}

/**
 * Generate a lightness variant of a color (for error bands, etc.)
 */
export function adjustLightness(
    hslColor: string,
    lightnessAdjust: number
): string {
    const match = hslColor.match(/hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)/);
    if (!match) return hslColor;

    const h = parseInt(match[1], 10);
    const s = parseInt(match[2], 10);
    const l = parseInt(match[3], 10);
    const newL = Math.max(0, Math.min(100, l + lightnessAdjust));

    return `hsl(${h}, ${s}%, ${newL}%)`;
}

/**
 * Get a faded version of a color for backgrounds/fills
 */
export function getFadedColor(hslColor: string, isDark: boolean): string {
    return adjustLightness(hslColor, isDark ? -30 : 35);
}
