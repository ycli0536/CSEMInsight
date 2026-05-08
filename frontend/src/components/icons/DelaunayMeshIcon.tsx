import type { SVGProps } from 'react';

export function DelaunayMeshIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      className={className}
      data-icon="delaunay-mesh"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 18.5 6 6 13.5 3.5 20 9 18.5 19.5 9 20.5 4 18.5Z" />
      <path d="M6 6 9 20.5" />
      <path d="M6 6 11.5 11" />
      <path d="M13.5 3.5 11.5 11" />
      <path d="M13.5 3.5 20 9" />
      <path d="M20 9 11.5 11" />
      <path d="M18.5 19.5 11.5 11" />
      <path d="M9 20.5 11.5 11" />
      <path d="M4 18.5 11.5 11" />
    </svg>
  );
}
