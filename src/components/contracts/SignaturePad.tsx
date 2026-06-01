import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string;
}

export const SignaturePad = forwardRef<SignaturePadHandle, { className?: string }>(
  function SignaturePad({ className }, ref) {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const lastRef = useRef<{ x: number; y: number } | null>(null);
    const [empty, setEmpty] = useState(true);

    // Init canvas with HiDPI scaling
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.2;
      };
      resize();
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }, []);

    const getPos = (e: PointerEvent | React.PointerEvent) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const start = (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastRef.current = getPos(e);
    };

    const move = (e: React.PointerEvent) => {
      if (!drawingRef.current) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || !lastRef.current) return;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastRef.current.x, lastRef.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastRef.current = p;
      if (empty) setEmpty(false);
    };

    const end = () => {
      drawingRef.current = false;
      lastRef.current = null;
    };

    const clear = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setEmpty(true);
    };

    useImperativeHandle(ref, () => ({
      clear,
      isEmpty: () => empty,
      toDataURL: () => {
        const canvas = canvasRef.current;
        if (!canvas) return "";
        // Render onto a white background for PDF compatibility
        const out = document.createElement("canvas");
        out.width = canvas.width;
        out.height = canvas.height;
        const ctx = out.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(canvas, 0, 0);
        return out.toDataURL("image/png");
      },
    }));

    return (
      <div className={className}>
        <div className="relative overflow-hidden rounded-xl border border-border/70 bg-white">
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            onPointerCancel={end}
            className="block h-44 w-full touch-none cursor-crosshair"
          />
          {empty && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="select-none text-sm text-slate-400">
                {t("signaturePad.placeholder")}
              </span>
            </div>
          )}
        </div>
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={clear}
            className="gap-1.5 text-xs"
          >
            <Eraser className="h-3.5 w-3.5" /> {t("signaturePad.clear")}
          </Button>
        </div>
      </div>
    );
  },
);
