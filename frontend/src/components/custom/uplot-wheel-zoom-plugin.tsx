/* eslint-disable no-inner-declarations */
import uPlot from 'uplot';

type UPlotInstance = uPlot & {
    over: HTMLElement;
    cursor: { left: number; top: number };
};


export const wheelZoomPlugin = (opts: { factor: number; drag: boolean; scroll: boolean}): uPlot.Plugin => {
    const factor = opts.factor || 0.75;

    function clamp(nRange: number, nMin: number, nMax: number, fRange: number, fMin: number, fMax: number) {
        if (nRange > fRange) {
            nMin = fMin;
            nMax = fMax;
        }
        else if (nMin < fMin) {
            nMin = fMin;
            nMax = fMin + nRange;
        }
        else if (nMax > fMax) {
            nMax = fMax;
            nMin = fMax - nRange;
        }

        return [nMin, nMax];
    }

    return {
        hooks: {
            init: [
                (u: UPlotInstance) => {
                    const axisEls = u.root.querySelectorAll('.u-axis');

                    for (let i = 0; i < axisEls.length; i++) {
                        if (i > 0) {
                            const el = axisEls[i];

                            el.addEventListener('mousedown', (event: MouseEvent) => {
                                const y0 = event.clientY;
                                const scaleKey = u.axes[i].scale;
                                const scale = u.scales[scaleKey];
                                const { min, max } = scale;
                                const unitsPerPx = (max - min) / (u.bbox.height / uPlot.pxRatio);

                                const mousemove = (moveEvent: MouseEvent) => {
                                    const dy = moveEvent.clientY - y0;
                                    const shiftyBy = dy * unitsPerPx;

                                    u.setScale(scaleKey, {
                                        min: moveEvent.shiftKey ? (min - shiftyBy) : min + shiftyBy,
                                        max: max + shiftyBy,
                                    });
                                };

                                const mouseup = () => {
                                    document.removeEventListener('mousemove', mousemove);
                                    document.removeEventListener('mousemove', mouseup);
                                };

                                document.addEventListener('mousemove', mousemove);
                                document.addEventListener('mouseup', mouseup);
                            });
                        }
                    }
                },
            ],
            ready: (u: UPlotInstance) => {
                const xMin = u.scales.x.min;
                const xMax = u.scales.x.max;
                const yMin = u.scales.y.min;
                const yMax = u.scales.y.max;

                const xRange = xMax - xMin;
                const yRange = yMax - yMin;

                const over = u.over;
                const rect = over.getBoundingClientRect();

                const xPaddingFactor = 0.01;
                const yPaddingFactor = 0.01;

                // wheel drag pan
                if (opts.drag) {
                    over.addEventListener("mousedown", (event: MouseEvent) => {
                        if (event.button == 1) {
                            // plot.style.cursor = "move";
                            event.preventDefault();

                            const left0 = event.clientX;

                            const scXMin0 = u.scales.x.min;
                            const scXMax0 = u.scales.x.max;

                            const xUnitsPerPx = u.posToVal(1, 'x') - u.posToVal(0, 'x');

                            const top0 = event.clientY;

                            const scYMin0 = u.scales.y.min;
                            const scYMax0 = u.scales.y.max;

                            const yUnitsPerPx = u.posToVal(1, 'y') - u.posToVal(0, 'y');

                            function onmove(moveEvent: MouseEvent) {
                                moveEvent.preventDefault();

                                const left1 = moveEvent.clientX;
                                const top1 = moveEvent.clientY;

                                const dx = xUnitsPerPx * (left1 - left0);
                                const dy = yUnitsPerPx * (top1 - top0);

                                const newXMin = scXMin0 - dx;
                                const newXMax = scXMax0 - dx;

                                const newYMin = scYMin0 - dy;
                                const newYMax = scYMax0 - dy;

                                // Set the limits for the x-axis
                                const xMinLimit = xMin; // original minimum value
                                const xMaxLimit = xMax; // original maximum value

                                // Set the limits for the y-axis
                                const yMinLimit = yMin; // original minimum value
                                const yMaxLimit = yMax; // original maximum value

                                // Check if the new minimum and maximum values are within the limits
                                if (newXMin >= xMinLimit - xPaddingFactor * xRange && newXMax <= xMaxLimit + xPaddingFactor * xRange) {
                                    u.setScale('x', {
                                        min: newXMin,
                                        max: newXMax,
                                    });
                                }
                                // Check if the new minimum and maximum values are within the limits
                                if (u.scales.y.distr === 3) {
                                    // console.log('y distribution is 3');
                                    if (newYMin > 1e-20 && newYMin >= yMinLimit - yPaddingFactor * yRange && newYMax <= yMaxLimit + yPaddingFactor * yRange) {
                                        u.setScale('y', {
                                            min: newYMin,
                                            max: newYMax,
                                        });
                                    }
                                }
                                else {
                                    // console.log('y distribution is not 3');
                                    if (newYMin >= yMinLimit - yPaddingFactor * yRange && newYMax <= yMaxLimit + yPaddingFactor * yRange) {
                                    u.setScale('y', {
                                        min: newYMin,
                                        max: newYMax,
                                    });
                                }
                                }
                            }

                            function onup() {
                                document.removeEventListener("mousemove", onmove);
                                document.removeEventListener("mouseup", onup);
                            }

                            document.addEventListener("mousemove", onmove);
                            document.addEventListener("mouseup", onup);
                        }
                    });
                }

                if (opts.scroll) {
                    // wheel scroll zoom
                    over.addEventListener("wheel", (event: WheelEvent) => {
                        event.preventDefault();

                        const {left, top} = u.cursor;

                        const leftPct = left/rect.width;
                        const btmPct = 1 - top/rect.height;
                        const xVal = u.posToVal(left, "x");
                        const yVal = u.posToVal(top, "y");
                        const oxRange = u.scales.x.max - u.scales.x.min;
                        const oyRange = u.scales.y.max - u.scales.y.min;

                        const nxRange = event.deltaY < 0 ? oxRange * factor : oxRange / factor;
                        let nxMin = xVal - leftPct * nxRange;
                        let nxMax = nxMin + nxRange;
                        [nxMin, nxMax] = clamp(nxRange, nxMin, nxMax, 
                            xRange, xMin - xPaddingFactor * xRange, xMax + xPaddingFactor * xRange);

                        const nyRange = event.deltaY < 0 ? oyRange * factor : oyRange / factor;
                        let nyMin = yVal - btmPct * nyRange;
                        let nyMax = nyMin + nyRange;
                        [nyMin, nyMax] = clamp(nyRange, nyMin, nyMax, yRange, yMin, yMax);

                        u.batch(() => {
                            u.setScale("x", {
                                min: nxMin,
                                max: nxMax,
                            });

                            u.setScale("y", {
                                min: nyMin,
                                max: nyMax,
                            });
                        });
                    });
                }
            }
        }
    };
}