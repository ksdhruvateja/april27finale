import { useState } from "react";
import { useUpdateInventoryItem, getListInventoryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Modal, { FormField, FormInput, SubmitBar } from "./Modal";

interface InventoryAdjustModalProps {
  onClose: () => void;
  inventory?: {
    id: number;
    productId: number;
    initialStock: number;
    stockIn: number;
    stockOut: number;
    pendingOut: number;
    quantity: number;
    reorderPoint: number;
  };
  productName?: string;
}

export default function InventoryAdjustModal({ onClose, inventory, productName }: InventoryAdjustModalProps) {
  const updateInventory = useUpdateInventoryItem();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    initialStock: inventory?.initialStock ?? "",
    stockIn: inventory?.stockIn ?? "",
    stockOut: inventory?.stockOut ?? "",
    pendingOut: inventory?.pendingOut ?? "",
    reorderPoint: inventory?.reorderPoint ?? "",
  });

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [key]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inventory) return;

    const initialStock = parseFloat(form.initialStock.toString()) || 0;
    const stockIn = parseFloat(form.stockIn.toString()) || 0;
    const stockOut = parseFloat(form.stockOut.toString()) || 0;
    const pendingOut = parseFloat(form.pendingOut.toString()) || 0;
    const quantity = initialStock + stockIn - stockOut - pendingOut;

    updateInventory.mutate(
      {
        id: inventory.id,
        data: {
          initialStock,
          stockIn,
          stockOut,
          pendingOut,
          quantity,
          reorderPoint: parseFloat(form.reorderPoint.toString()) || 10,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
          onClose();
        },
      }
    );
  };

  const initialStock = parseFloat(form.initialStock.toString()) || 0;
  const stockIn = parseFloat(form.stockIn.toString()) || 0;
  const stockOut = parseFloat(form.stockOut.toString()) || 0;
  const pendingOut = parseFloat(form.pendingOut.toString()) || 0;
  const currentStock = initialStock + stockIn - stockOut - pendingOut;

  return (
    <Modal
      title="Adjust Inventory"
      subtitle={productName}
      onClose={onClose}
      footer={
        <form onSubmit={handleSubmit} id="adjust-inventory-form">
          <SubmitBar onClose={onClose} isLoading={updateInventory.isPending} label="Update" />
        </form>
      }
    >
      <form onSubmit={handleSubmit} id="adjust-inventory-form" className="flex flex-col gap-4">
        <FormField label="Initial Stock">
          <FormInput
            type="number"
            step="0.01"
            min="0"
            placeholder="Starting quantity"
            value={form.initialStock}
            onChange={set("initialStock")}
          />
        </FormField>

        <FormField label="Stock In (Received)">
          <FormInput
            type="number"
            step="0.01"
            min="0"
            placeholder="Quantity received"
            value={form.stockIn}
            onChange={set("stockIn")}
          />
        </FormField>

        <FormField label="Stock Out (Sold/Used)">
          <FormInput
            type="number"
            step="0.01"
            min="0"
            placeholder="Quantity sold or used"
            value={form.stockOut}
            onChange={set("stockOut")}
          />
        </FormField>

        <FormField label="Pending Out (Reserved)">
          <FormInput
            type="number"
            step="0.01"
            min="0"
            placeholder="Quantity reserved/pending"
            value={form.pendingOut}
            onChange={set("pendingOut")}
          />
        </FormField>

        <div
          className="p-3 rounded-lg flex flex-col gap-2"
          style={{ background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.25)" }}
        >
          <div className="text-xs font-semibold uppercase" style={{ color: "#93c5fd" }}>Current Stock Calculation</div>
          <div className="text-sm font-mono" style={{ color: "#ffffff" }}>
            {initialStock} + {stockIn} - {stockOut} - {pendingOut} = <strong style={{ fontSize: "1.25em" }}>{currentStock}</strong>
          </div>
        </div>

        <FormField label="Reorder Point">
          <FormInput
            type="number"
            step="0.01"
            min="0"
            placeholder="Low stock threshold"
            value={form.reorderPoint}
            onChange={set("reorderPoint")}
          />
        </FormField>
      </form>
    </Modal>
  );
}
