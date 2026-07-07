import { requireIsoDate, type IsoDate } from "./date.ts";
import { stableFingerprint } from "./fingerprint.ts";
import { createMoney, requirePositiveMoney, type Money } from "./money.ts";

export type OrderStatus =
  | "ordered"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "unknown";

export type OrderItemType =
  | "product"
  | "shipping"
  | "discount"
  | "tax"
  | "gift_card"
  | "refund"
  | "fee"
  | "unknown";

export type OrderItem = {
  id: string;
  orderId: string;
  title: string;
  asin?: string;
  quantity: number;
  unitPrice?: Money;
  totalPrice: Money;
  itemType: OrderItemType;
  createdAt: string;
  updatedAt: string;
};

export type OrderPayment = {
  id: string;
  orderId: string;
  paymentDate?: IsoDate;
  amount: Money;
  paymentMethodHint?: string;
  externalPaymentId?: string;
  createdAt: string;
};

export type Order = {
  id: string;
  merchantId: string;
  importRunId: string;
  rawRecordId?: string;
  externalOrderId: string;
  orderDate: IsoDate;
  shipmentDate?: IsoDate;
  invoiceDate?: IsoDate;
  status: OrderStatus;
  totalAmount: Money;
  paymentMethodHint?: string;
  fingerprint: string;
  items: OrderItem[];
  payments: OrderPayment[];
  createdAt: string;
  updatedAt: string;
};

export type CreateOrderInput = {
  id: string;
  merchantId: string;
  importRunId: string;
  rawRecordId?: string;
  externalOrderId: string;
  orderDate: string;
  shipmentDate?: string;
  invoiceDate?: string;
  status: OrderStatus;
  totalAmountMinor: number;
  currency: string;
  paymentMethodHint?: string;
  items?: Array<{
    id: string;
    title: string;
    asin?: string;
    quantity: number;
    unitPriceMinor?: number;
    totalPriceMinor: number;
    itemType: OrderItemType;
  }>;
  payments?: Array<{
    id: string;
    paymentDate?: string;
    amountMinor: number;
    paymentMethodHint?: string;
    externalPaymentId?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

export function createOrder(input: CreateOrderInput): Order {
  const orderDate = requireIsoDate(input.orderDate, "orderDate");
  const shipmentDate = input.shipmentDate ? requireIsoDate(input.shipmentDate, "shipmentDate") : undefined;
  const invoiceDate = input.invoiceDate ? requireIsoDate(input.invoiceDate, "invoiceDate") : undefined;
  const status = requireOrderStatus(input.status);
  const totalAmount = requirePositiveMoney(createMoney(input.totalAmountMinor, input.currency));
  const now = new Date().toISOString();
  const orderId = requireNonBlank(input.id, "id");
  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;

  const order: Order = {
    id: orderId,
    merchantId: requireNonBlank(input.merchantId, "merchantId"),
    importRunId: requireNonBlank(input.importRunId, "importRunId"),
    rawRecordId: optionalTrimmed(input.rawRecordId),
    externalOrderId: requireNonBlank(input.externalOrderId, "externalOrderId"),
    orderDate,
    shipmentDate,
    invoiceDate,
    status,
    totalAmount,
    paymentMethodHint: optionalTrimmed(input.paymentMethodHint),
    fingerprint: stableFingerprint({
      merchantId: input.merchantId,
      externalOrderId: input.externalOrderId,
      orderDate,
      totalAmountMinor: totalAmount.amountMinor,
      currency: totalAmount.currency,
    }),
    items: [],
    payments: [],
    createdAt,
    updatedAt,
  };

  order.items = (input.items ?? []).map((item) => createOrderItem(orderId, item, totalAmount.currency, createdAt, updatedAt));
  order.payments = (input.payments ?? []).map((payment) => createOrderPayment(orderId, payment, totalAmount.currency, createdAt));

  return order;
}

function createOrderItem(
  orderId: string,
  input: NonNullable<CreateOrderInput["items"]>[number],
  currency: string,
  createdAt: string,
  updatedAt: string,
): OrderItem {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("order item quantity must be greater than zero");
  }

  return {
    id: requireNonBlank(input.id, "item.id"),
    orderId,
    title: requireNonBlank(input.title, "item.title"),
    asin: optionalTrimmed(input.asin),
    quantity: input.quantity,
    unitPrice: input.unitPriceMinor === undefined ? undefined : createMoney(input.unitPriceMinor, currency),
    totalPrice: createMoney(input.totalPriceMinor, currency),
    itemType: requireOrderItemType(input.itemType),
    createdAt,
    updatedAt,
  };
}

function createOrderPayment(
  orderId: string,
  input: NonNullable<CreateOrderInput["payments"]>[number],
  currency: string,
  createdAt: string,
): OrderPayment {
  return {
    id: requireNonBlank(input.id, "payment.id"),
    orderId,
    paymentDate: input.paymentDate ? requireIsoDate(input.paymentDate, "payment.paymentDate") : undefined,
    amount: requirePositiveMoney(createMoney(input.amountMinor, currency)),
    paymentMethodHint: optionalTrimmed(input.paymentMethodHint),
    externalPaymentId: optionalTrimmed(input.externalPaymentId),
    createdAt,
  };
}

function requireOrderStatus(value: string): OrderStatus {
  if (
    value !== "ordered" &&
    value !== "shipped" &&
    value !== "delivered" &&
    value !== "cancelled" &&
    value !== "refunded" &&
    value !== "unknown"
  ) {
    throw new Error("order status is invalid");
  }

  return value;
}

function requireOrderItemType(value: string): OrderItemType {
  if (
    value !== "product" &&
    value !== "shipping" &&
    value !== "discount" &&
    value !== "tax" &&
    value !== "gift_card" &&
    value !== "refund" &&
    value !== "fee" &&
    value !== "unknown"
  ) {
    throw new Error("order item type is invalid");
  }

  return value;
}

function requireNonBlank(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} must not be blank`);
  }

  return trimmed;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
