import ShippingRateModal from "./ShippingRateModal";

interface Props {
  customerId: number;
  invoiceId?: number | null;
  customerName: string;
  lineItems?: Array<{ description: string; quantity: number }>;
  defaultInternalNote?: string;
  vendorCarrierName?: string | null;
  vendorCarrierAccount?: string | null;
  onClose: () => void;
}

export default function ShipmentModal(props: Props) {
  return <ShippingRateModal {...props} />;
}
