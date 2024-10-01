import React, { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { wheelZoomPlugin } from '@/components/custom/uplot-wheel-zoom-plugin';
import { Label } from '@/components/ui/label';
import { useInv2DStore } from '@/store/settingFormStore';


const HeatmapComponent: React.FC = () => {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const { invData } = useInv2DStore();
  const [legendValue, setLegendValue] = useState<string>('');

  useEffect(() => {

    const testData = [
      invData.map(d => d.Y),
      invData.map(d => d.Z),
      invData.map(d => d.rho1),
    ];

    function round3(val: number) {
      return Math.round(val * 1000) / 1000;
  }

    const turboPalette = generateTurboPalette(256);

    const palette = turboPalette.reverse();

    function countsToFills(u: uPlot, seriesIdx: number): number[] {
      const counts = (u.data[seriesIdx][2] ?? []) as number[];

      let minCount = Infinity;
      let maxCount = -Infinity;

      for (let i = 0; i < counts.length; i++) {
        if (counts[i] > 0) {
          minCount = Math.min(minCount, counts[i]);
          maxCount = Math.max(maxCount, counts[i]);
        }
      }

      const range = maxCount - minCount;

      const paletteSize = palette.length;

      const indexedFills = new Array<number>(counts.length);

      for (let i = 0; i < counts.length; i++)
        indexedFills[i] =
          counts[i] === 0
            ? -1
            : Math.min(
                paletteSize - 1,
                Math.floor((paletteSize * (counts[i] - minCount)) / range)
              );

      return indexedFills;
    }

        function interpolateTurbo(t: number): string {
      // Clamping t to the [0,1] range
      t = Math.max(0, Math.min(1, t));
    
      const kRedCoefficients = [
        0.13572138,
        4.61539260,
        -42.66032258,
        132.13108234,
        -152.94239396,
        59.28637943,
      ];
      const kGreenCoefficients = [
        0.09140261,
        2.19418839,
        4.84296658,
        -14.18503333,
        4.27729857, 
        2.82956604
      ];
      const kBlueCoefficients = [
        0.10667330, 
        12.64194608, 
        -60.58204836, 
        110.36276771,
        -89.90310912,
        27.34824973
      ];
    
      function evaluatePolynomial(coefficients: number[], t: number): number {
        return (
          coefficients[0] +
          t *
            (coefficients[1] +
              t *
                (coefficients[2] +
                  t *
                    (coefficients[3] +
                      t * (coefficients[4] + t * coefficients[5]))))
        );
      }
    
      const r = evaluatePolynomial(kRedCoefficients, t);
      const g = evaluatePolynomial(kGreenCoefficients, t);
      const b = evaluatePolynomial(kBlueCoefficients, t);
    
      // Clamp values to [0,1]
      const rClamped = Math.max(0, Math.min(1, r));
      const gClamped = Math.max(0, Math.min(1, g));
      const bClamped = Math.max(0, Math.min(1, b));
    
      // Convert to RGB values [0,255]
      const rInt = Math.round(rClamped * 255);
      const gInt = Math.round(gClamped * 255);
      const bInt = Math.round(bClamped * 255);
    
      return `rgb(${rInt},${gInt},${bInt})`;
    }
    
    function generateTurboPalette(numColors: number): string[] {
      const palette = [];
      for (let i = 0; i < numColors; i++) {
        const t = i / (numColors - 1);
        palette.push(interpolateTurbo(t));
      }
      return palette;
    }

    interface HeatmapPathsOptions {
      disp: {
      fill: {
        lookup: string[];
        values: (u: uPlot, seriesIdx: number) => number[];
      };
      };
    }

    function heatmapPaths(opts: HeatmapPathsOptions): uPlot.Series.PathBuilder {
      const { disp } = opts;

      return (u: uPlot, seriesIdx: number): uPlot.Series.Paths | null => {
      return uPlot.orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim, moveTo, lineTo, rect) => {
          const d = u.data[seriesIdx];
          const [xs, ys, counts] = d as unknown as [number[], number[], number[]];
          const dlen = xs.length;

          // fill colors are mapped from interpolating densities / counts along some gradient
          // (should be quantized to 64 colors/levels max. e.g. 16)
          const fills = disp.fill.values(u, seriesIdx);
          const fillPalette = disp.fill.lookup ?? [...new Set(fills)];
          const fillPaths = fillPalette.map(() => new Path2D());

          // detect x and y bin qtys by detecting layout repetition in x & y data
          const yBinQty = dlen - ys.lastIndexOf(ys[0]);
          const xBinQty = dlen / yBinQty;
          const yBinIncr = ys[1] - ys[0];
          const xBinIncr = xs[yBinQty] - xs[0];

          // uniform tile sizes based on zoom level
          const xSize = valToPosX(xBinIncr, scaleX, xDim, xOff) - valToPosX(0, scaleX, xDim, xOff);
          const ySize = valToPosY(yBinIncr, scaleY, yDim, yOff) - valToPosY(0, scaleY, yDim, yOff);

          // pre-compute x and y offsets
          const cys = ys.slice(0, yBinQty).map(y => valToPosY(y, scaleY, yDim, yOff) - ySize / 2);
          const cxs = Array.from({ length: xBinQty }, (v, i) => valToPosX(xs[i * yBinQty], scaleX, xDim, xOff) - xSize / 2);

          for (let i = 0; i < dlen; i++) {
            if (counts && counts[i] > 0 &&
              xs[i] >= (scaleX.min ?? -Infinity) && xs[i] <= (scaleX.max ?? Infinity) &&
              ys[i] >= (scaleY.min ?? -Infinity) && ys[i] <= (scaleY.max ?? Infinity)) {
              const cx = cxs[~~(i / yBinQty)];
              const cy = cys[i % yBinQty];
              const fillPath = fillPaths[fills[i]];
              rect(fillPath, cx, cy, xSize, ySize);
            }
          }

          u.ctx.save();
          u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
          u.ctx.clip();
          fillPaths.forEach((p, i) => {
            u.ctx.fillStyle = fillPalette[i];
            u.ctx.fill(p);
            // u.ctx.strokeStyle = 'none';
            // u.ctx.stroke(p);
          });
          u.ctx.restore();
        });
      };
    }

    const opts: uPlot.Options = {
      width: 1000,
      height: 600,
      mode: 2,
      title: 'Inversion result',
      scales: {
      x: {
        time: false,
        dir: -1,
      },
      y: {
        dir: -1,
      },
      },
      series: [
      {},
      {
        label: 'Resisiivity',
        paths: heatmapPaths({
          disp: {
            fill: {
            lookup: palette,
            values: countsToFills,
            },
          },
        }),
        facets:[
          {scale: 'x', auto: true},
          {scale: 'y'},
        ],
      },
      ],
      legend: {
        show: false, // use hooks to show legend
      },
      axes: [
      {
        scale: 'x',
        label: 'Inline distance (m)',
        labelFont: 'bold 20px Helvetica',
        // font: "14px Arial",
        stroke: 'black',
        size: 40,
        space: 100,
        grid: {show: false},
      },
      {
        scale: 'y',
        label: 'Depth (m)',
        labelFont: 'bold 20px Helvetica',
        // font: "14px Arial",
        stroke: 'black',
        size: 60,
        space: 40,
        grid: {show: false},
      },
      ],
      cursor: {
        drag: { x: true, y: true, uni: 1, dist: 30 },
        lock: true,
      },
      plugins: [
        wheelZoomPlugin({
          factor: 0.9,
          drag: true,
          scroll: true,
        }),
      ],
      hooks: {
        setCursor: [
          (u) => {
            const { left, top, width, height } = u.bbox;
            const { left: plotLeft, top: plotTop } = u.over.getBoundingClientRect();
            const x = u.cursor.left;
            const y = u.cursor.top;

            if (x != null && y != null && x >= 0 && y >= 0 && x <= width && y <= height) {
              const dataX = u.posToVal(x, 'x');
              const dataY = u.posToVal(y, 'y');

              const xs = (u.data[1][0] ?? []) as number[];
              const ys = (u.data[1][1] ?? []) as number[];
              const rho = (u.data[1][2] ?? []) as number[];

              // Find the closest data point
              let closestIdx = -1;
              let minDist = Infinity;
              for (let i = 0; i < xs.length; i++) {
                const dist = Math.hypot(xs[i] - dataX, ys[i] - dataY);
                if (dist < minDist) {
                  minDist = dist;
                  closestIdx = i;
                }
              }

              if (closestIdx !== -1) {
                setLegendValue(`(${xs[closestIdx]}, ${ys[closestIdx]}) = ${round3(10**(rho[closestIdx]))} Ohm.m`);
              }
            }
          },
        ],
      },
    };

    const data = [null, testData];

    const u = new uPlot(opts, data, plotRef.current!);

    return () => {
      u.destroy();
    };
  }, [invData]);

  return (
      <div className='overflow-auto'>
        <div ref={plotRef}></div>
        <Label className='flex items-center justify-center'>
          {legendValue}
        </Label>
    </div>
  )
};

export default HeatmapComponent;
