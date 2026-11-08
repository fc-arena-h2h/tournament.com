import React, { useEffect, useRef } from 'react';

interface MoveItem {
  d: string;
  head: 'arrow' | 'bar';
}

interface TacticsStep {
  type: 'x' | 'o' | 'moves';
  items: any[];
  delay: number;
}

interface TacticsScene {
  steps: TacticsStep[];
}

const SCENES: TacticsScene[] = [
  // Scene 1 (0:00 - 0:07)
  {
    steps: [
      { type: 'x', items: [[187, 250], [381, 216], [291, 483]], delay: 180 },
      {
        type: 'o',
        items: [
          [695, 76], [728, 232], [728, 346], [928, 272],
          [468, 146], [468, 412], [685, 482],
          [247, 114], [185, 198], [357, 252], [225, 492]
        ],
        delay: 140
      },
      {
        type: 'moves',
        items: [
          { d: 'M 672 74 Q 445 35 375 200', head: 'arrow' },
          { d: 'M 710 222 L 664 195', head: 'arrow' },
          { d: 'M 708 352 L 656 375', head: 'arrow' },
          { d: 'M 664 480 L 315 524', head: 'bar' },
          { d: 'M 342 232 Q 332 162 292 146', head: 'arrow' },
          { d: 'M 355 275 Q 325 415 262 465', head: 'arrow' },
          { d: 'M 225 114 L 160 114', head: 'arrow' },
          { d: 'M 164 198 L 116 216', head: 'arrow' },
          { d: 'M 218 470 Q 175 370 154 275', head: 'arrow' },
          { d: 'M 204 494 L 146 494', head: 'arrow' }
        ],
        delay: 60
      }
    ]
  },

  // Scene 2 (0:08 - 0:17)
  {
    steps: [
      {
        type: 'o',
        items: [
          [158, 76], [190, 344], [344, 178], [352, 275], [344, 485],
          [474, 308], [614, 182], [768, 108], [722, 485], [786, 286], [928, 286]
        ],
        delay: 140
      },
      {
        type: 'x',
        items: [
          [682, 254], [634, 412], [584, 152], [574, 326], [408, 248],
          [426, 338], [312, 376], [234, 166], [154, 248], [148, 434]
        ],
        delay: 130
      },
      {
        type: 'moves',
        items: [
          { d: 'M 885 335 Q 805 205 642 182', head: 'arrow' },
          { d: 'M 744 108 L 802 108', head: 'arrow' },
          { d: 'M 744 108 L 690 108', head: 'arrow' },
          { d: 'M 592 188 Q 505 215 480 284', head: 'arrow' },
          { d: 'M 455 292 Q 435 205 372 182', head: 'arrow' },
          { d: 'M 322 172 Q 250 155 235 88', head: 'arrow' },
          { d: 'M 184 76 Q 285 110 212 325', head: 'arrow' },
          { d: 'M 168 344 Q 115 330 98 282', head: 'arrow' },
          { d: 'M 332 292 L 292 342', head: 'arrow' },
          { d: 'M 320 485 L 254 485', head: 'arrow' },
          { d: 'M 700 485 L 615 485', head: 'arrow' },
          { d: 'M 745 485 L 812 485', head: 'arrow' }
        ],
        delay: 60
      }
    ]
  },

  // Scene 3 (0:18 - 0:25)
  {
    steps: [
      {
        type: 'x',
        items: [
          [910, 250], [818, 290], [755, 114], [618, 92], [545, 232],
          [436, 326], [674, 435], [315, 482], [322, 112]
        ],
        delay: 130
      },
      {
        type: 'o',
        items: [
          [102, 260], [262, 405], [262, 146], [412, 258],
          [622, 146], [622, 398], [722, 276], [835, 146], [802, 412]
        ],
        delay: 140
      },
      {
        type: 'moves',
        items: [
          { d: 'M 102 284 Q 130 385 236 405', head: 'arrow' },
          { d: 'M 282 388 Q 330 275 282 168', head: 'arrow' },
          { d: 'M 305 135 Q 455 95 588 142', head: 'arrow' },
          { d: 'M 642 162 Q 668 355 768 412', head: 'arrow' },
          { d: 'M 648 140 L 725 118', head: 'bar' },
          { d: 'M 644 410 L 702 458', head: 'bar' },
          { d: 'M 792 388 Q 765 275 798 168', head: 'arrow' },
          { d: 'M 858 158 Q 892 215 928 298', head: 'arrow' }
        ],
        delay: 70
      }
    ]
  }
];

export const FootballTacticsAnimation: React.FC = () => {
  const layerRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    let cancelled = false;
    const timeouts: number[] = [];
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const registerTimeout = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timeouts.push(id);
      return id;
    };

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        registerTimeout(resolve, ms);
      });

    function animateStroke(el: SVGGeometryElement, duration = 260) {
      try {
        const length = el.getTotalLength();
        el.style.strokeDasharray = `${length}`;
        el.style.strokeDashoffset = `${length}`;
        el.getBoundingClientRect();
        el.style.transition = `stroke-dashoffset ${duration}ms ease-out`;
        el.style.strokeDashoffset = '0';
      } catch {
        // Ignore if element is not yet in DOM
      }
    }

    function applyWhiteStyle(el: SVGPathElement) {
      el.style.fill = 'none';
      el.style.stroke = '#ffffff';
      el.style.strokeWidth = '5';
      el.style.strokeLinecap = 'round';
      el.style.strokeLinejoin = 'round';
      el.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))';
    }

    function applyRedStyle(el: SVGPathElement) {
      el.style.fill = 'none';
      el.style.stroke = '#e61919';
      el.style.strokeWidth = '5';
      el.style.strokeLinecap = 'round';
      el.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))';
    }

    function applyArrowStyle(el: SVGPathElement) {
      el.style.fill = 'none';
      el.style.stroke = '#ffffff';
      el.style.strokeWidth = '4';
      el.style.strokeLinecap = 'round';
      el.style.strokeLinejoin = 'round';
      el.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))';
    }

    function drawX(x: number, y: number) {
      if (!layer || cancelled) return;
      const size = 13;
      const g = document.createElementNS(SVG_NS, 'g');

      const line1 = document.createElementNS(SVG_NS, 'path');
      line1.setAttribute('d', `M ${x - size} ${y - size} L ${x + size} ${y + size}`);
      applyWhiteStyle(line1);

      const line2 = document.createElementNS(SVG_NS, 'path');
      line2.setAttribute('d', `M ${x + size} ${y - size} L ${x - size} ${y + size}`);
      applyWhiteStyle(line2);

      g.appendChild(line1);
      g.appendChild(line2);
      layer.appendChild(g);

      animateStroke(line1, 140);
      registerTimeout(() => animateStroke(line2, 140), 100);
    }

    function drawO(x: number, y: number) {
      if (!layer || cancelled) return;
      const r = 16;
      const circle = document.createElementNS(SVG_NS, 'path');
      circle.setAttribute(
        'd',
        `M ${x} ${y - r} a ${r} ${r} 0 1 0 0 ${r * 2} a ${r} ${r} 0 1 0 0 -${r * 2}`
      );
      applyRedStyle(circle);
      layer.appendChild(circle);
      animateStroke(circle, 260);
    }

    function drawMove(moveObj: MoveItem) {
      if (!layer || cancelled) return;
      const g = document.createElementNS(SVG_NS, 'g');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', moveObj.d);
      applyArrowStyle(path);
      g.appendChild(path);
      layer.appendChild(g);

      const totalLen = path.getTotalLength();
      const endPt = path.getPointAtLength(totalLen);
      const prevPt = path.getPointAtLength(Math.max(0, totalLen - 12));
      const angle = Math.atan2(endPt.y - prevPt.y, endPt.x - prevPt.x);

      animateStroke(path, 450);

      registerTimeout(() => {
        if (cancelled) return;
        const head = document.createElementNS(SVG_NS, 'path');
        applyArrowStyle(head);

        if (moveObj.head === 'arrow') {
          const headLen = 16;
          const a1 = angle + Math.PI * 0.82;
          const a2 = angle - Math.PI * 0.82;
          const x1 = endPt.x + headLen * Math.cos(a1);
          const y1 = endPt.y + headLen * Math.sin(a1);
          const x2 = endPt.x + headLen * Math.cos(a2);
          const y2 = endPt.y + headLen * Math.sin(a2);
          head.setAttribute('d', `M ${x1} ${y1} L ${endPt.x} ${endPt.y} L ${x2} ${y2}`);
        } else if (moveObj.head === 'bar') {
          const barLen = 14;
          const perp = angle + Math.PI / 2;
          const x1 = endPt.x + barLen * Math.cos(perp);
          const y1 = endPt.y + barLen * Math.sin(perp);
          const x2 = endPt.x - barLen * Math.cos(perp);
          const y2 = endPt.y - barLen * Math.sin(perp);
          head.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
        }

        g.appendChild(head);
        animateStroke(head, 150);
      }, 380);
    }

    async function playTacticsLoop() {
      while (!cancelled) {
        for (const scene of SCENES) {
          if (cancelled || !layer) return;
          layer.innerHTML = '';
          await wait(400);
          if (cancelled) return;

          for (const step of scene.steps) {
            if (cancelled) return;
            for (const item of step.items) {
              if (cancelled) return;
              if (step.type === 'x') drawX(item[0], item[1]);
              else if (step.type === 'o') drawO(item[0], item[1]);
              else if (step.type === 'moves') drawMove(item);
              await wait(step.delay);
            }
            await wait(300);
          }
          await wait(2200);
        }
      }
    }

    playTacticsLoop();

    return () => {
      cancelled = true;
      timeouts.forEach((id) => window.clearTimeout(id));
      if (layer) {
        layer.innerHTML = '';
      }
    };
  }, []);

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#2b580c]">
      <svg
        className="w-full h-full block"
        viewBox="0 0 1000 562"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Grass Texture Filter */}
          <filter id="grass-texture" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves={4}
              result="noise"
            />
            <feColorMatrix
              type="matrix"
              values="
                0.1  0    0    0  0.16
                0    0.22 0    0  0.34
                0    0    0.05 0  0.04
                0    0    0    1  0"
              in="noise"
              result="coloredNoise"
            />
          </filter>

          {/* Dark Vignette Radial Gradient */}
          <radialGradient id="vignette" cx="50%" cy="50%" r="60%" fx="50%" fy="50%">
            <stop offset="55%" stopColor="#000000" stopOpacity="0" />
            <stop offset="85%" stopColor="#000000" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.85" />
          </radialGradient>
        </defs>

        {/* Grass Background */}
        <rect width="1000" height="562" fill="#2b580c" />
        <rect width="1000" height="562" filter="url(#grass-texture)" />

        {/* Football Pitch Lines */}
        <g
          fill="none"
          stroke="rgba(255, 255, 255, 0.88)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Outline & Halfway Line */}
          <rect x="45" y="30" width="910" height="502" />
          <line x1="500" y1="30" x2="500" y2="532" />

          {/* Center Circle & Spot */}
          <circle cx="500" cy="281" r="76" />
          <circle cx="500" cy="281" r="3" fill="rgba(255, 255, 255, 0.9)" />

          {/* Left Penalty Box & Goalpost */}
          <rect x="45" y="120" width="145" height="322" />
          <rect x="45" y="198" width="52" height="166" />
          <rect x="23" y="244" width="22" height="74" />
          <circle cx="152" cy="281" r="3" fill="rgba(255, 255, 255, 0.9)" />
          <path d="M 190 220 A 76 76 0 0 1 190 342" />

          {/* Right Penalty Box & Goalpost */}
          <rect x="810" y="120" width="145" height="322" />
          <rect x="903" y="198" width="52" height="166" />
          <rect x="955" y="244" width="22" height="74" />
          <circle cx="848" cy="281" r="3" fill="rgba(255, 255, 255, 0.9)" />
          <path d="M 810 220 A 76 76 0 0 0 810 342" />

          {/* 4 Corner Arcs */}
          <path d="M 45 46 A 16 16 0 0 0 61 30" />
          <path d="M 45 516 A 16 16 0 0 1 61 532" />
          <path d="M 939 30 A 16 16 0 0 0 955 46" />
          <path d="M 939 532 A 16 16 0 0 1 955 516" />
        </g>

        {/* Dark Vignette Overlay */}
        <rect width="1000" height="562" fill="url(#vignette)" pointerEvents="none" />

        {/* Dynamic Tactical Animation Layer */}
        <g ref={layerRef} id="tactics-layer" />
      </svg>
    </div>
  );
};
