"use client";

import Image from "next/image";

interface ChessPieceProps {
  piece: string | null;
  size?: number;
  className?: string;
  onDragStart?: (e: React.DragEvent) => void;
}

const pieceToSvgName: Record<string, string> = {
  K: "Chess_klt45.svg", Q: "Chess_qlt45.svg", R: "Chess_rlt45.svg", B: "Chess_blt45.svg", N: "Chess_nlt45.svg", P: "Chess_plt45.svg",
  k: "Chess_kdt45.svg", q: "Chess_qdt45.svg", r: "Chess_rdt45.svg", b: "Chess_bdt45.svg", n: "Chess_ndt45.svg", p: "Chess_pdt45.svg",
};

export default function ChessPiece({ piece, size = 40, className = "", onDragStart }: ChessPieceProps) {
  if (!piece) return null;
  
  const svgName = pieceToSvgName[piece];
  if (!svgName) return null;
  
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className={`select-none flex items-center justify-center cursor-grab active:cursor-grabbing ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <Image
        src={`/pieces/${svgName}`}
        alt={piece}
        width={size}
        height={size}
        className="object-contain drop-shadow-md pointer-events-none"
        priority
      />
    </div>
  );
}
