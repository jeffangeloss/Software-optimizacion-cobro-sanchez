"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { saveInitialLeftovers, verifyInitPin } from "@/app/actions/init-leftovers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Vendor = { id: string; name: string; code: string };
type Product = { id: string; name: string };

type InitialValues = Record<string, Record<string, number>>;

type InitialLeftoversFormProps = {
  vendors: Vendor[];
  products: Product[];
  initialValues: InitialValues;
  sourceDate: string;
  targetDate: string;
};

type Message = { kind: "success" | "error"; text: string };

const parseQty = (raw: string) => {
  const numeric = Number.parseInt(raw.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

export function InitialLeftoversForm({
  vendors,
  products,
  initialValues,
  sourceDate,
  targetDate,
}: InitialLeftoversFormProps) {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [values, setValues] = useState<InitialValues>(initialValues);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter((product) => product.name.toLowerCase().includes(normalized));
  }, [products, query]);

  const handleUnlock = () => {
    startTransition(async () => {
      const result = await verifyInitPin(pin);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.message ?? "PIN incorrecto." });
        return;
      }
      setUnlocked(true);
      setMessage(null);
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const entries = vendors.flatMap((vendor) =>
        products.map((product) => ({
          vendorId: vendor.id,
          productId: product.id,
          qty: values[vendor.id]?.[product.id] ?? 0,
        }))
      );
      const result = await saveInitialLeftovers({ pin, entries });
      if (!result.ok) {
        setMessage({ kind: "error", text: result.message ?? "No se pudo guardar." });
        return;
      }
      setMessage({ kind: "success", text: `Guardado. Sobras listas para ${targetDate}.` });
    });
  };

  const setQty = (vendorId: string, productId: string, raw: string) => {
    const qty = parseQty(raw);
    setValues((prev) => ({
      ...prev,
      [vendorId]: {
        ...prev[vendorId],
        [productId]: qty,
      },
    }));
  };

  const focusCell = (rowIndex: number, colIndex: number) => {
    const product = filteredProducts[rowIndex];
    const vendor = vendors[colIndex];
    if (!product || !vendor) return;
    const key = `${vendor.id}:${product.id}`;
    const el = inputRefs.current[key];
    if (!el) return;
    el.focus();
    el.select();
  };

  const handleNavKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (
      event.key !== "Enter" &&
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight"
    ) {
      return;
    }

    const target = event.currentTarget;
    const rowRaw = target.dataset.row;
    const colRaw = target.dataset.col;
    if (rowRaw === undefined || colRaw === undefined) return;

    const rowIndex = Number.parseInt(rowRaw, 10);
    const colIndex = Number.parseInt(colRaw, 10);
    if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return;

    let nextRow = rowIndex;
    let nextCol = colIndex;

    switch (event.key) {
      case "Enter":
      case "ArrowDown":
        nextRow += 1;
        break;
      case "ArrowUp":
        nextRow -= 1;
        break;
      case "ArrowLeft":
        nextCol -= 1;
        break;
      case "ArrowRight":
        nextCol += 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    focusCell(nextRow, nextCol);
  };

  if (!vendors.length || !products.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No hay datos para cargar</CardTitle>
        </CardHeader>
        <CardContent>
          Verifica que existan vendedores activos y productos activos.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Carga inicial de sobras</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Fecha de sobras: {sourceDate}.</p>
          <p>Se guardan como sobras de ayer para el dia {targetDate}.</p>
          <p>Todo lo que no llenes queda en 0.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PIN de acceso</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="PIN"
            inputMode="numeric"
            pattern="[0-9]*"
            className="max-w-[200px]"
            disabled={unlocked}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleUnlock();
            }}
          />
          <Button onClick={handleUnlock} disabled={isPending || unlocked || pin.length < 4}>
            Entrar
          </Button>
        </CardContent>
      </Card>

      {unlocked ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Sobras por producto</CardTitle>
              <p className="text-sm text-muted-foreground">
                Usa el buscador para filtrar productos.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar producto"
                className="sm:w-[220px]"
              />
              <Button onClick={handleSave} disabled={isPending}>
                Guardar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table containerClassName="rounded-xl border">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Producto</TableHead>
                  {vendors.map((vendor) => (
                    <TableHead key={vendor.id} className="text-center">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">{vendor.code}</span>
                        <span className="text-sm font-semibold">{vendor.name}</span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product, rowIndex) => (
                  <TableRow key={product.id}>
                    <TableCell className="whitespace-normal font-semibold">
                      {product.name}
                    </TableCell>
                    {vendors.map((vendor, colIndex) => (
                      <TableCell key={`${vendor.id}-${product.id}`} className="text-center">
                        <Input
                          ref={(el) => {
                            inputRefs.current[`${vendor.id}:${product.id}`] = el;
                          }}
                          value={String(values[vendor.id]?.[product.id] ?? 0)}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="h-9 w-[90px] text-center"
                          data-row={rowIndex}
                          data-col={colIndex}
                          onChange={(event) =>
                            setQty(vendor.id, product.id, event.target.value)
                          }
                          onKeyDown={handleNavKey}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {message ? (
              <div
                className={[
                  "rounded-xl px-3 py-2 text-sm",
                  message.kind === "success"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700",
                ].join(" ")}
              >
                {message.text}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
